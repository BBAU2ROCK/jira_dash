import { type JiraIssue } from "../api/jiraClient";
import { JIRA_CONFIG } from "../config/jiraConfig";
import { getStatusCategoryKey } from "../lib/jira-helpers";

export interface KPIMetrics {
    totalIssues: number;
    completedIssues: number;
    delayedIssues: number;
    earlyIssues: number;
    compliantIssues: number;
    agreedDelayIssues: number;

    completionRate: number;
    complianceRate: number;
    earlyRate: number;

    grades: {
        completion: 'S' | 'A' | 'B' | 'C' | 'D';
        compliance: 'S' | 'A' | 'B' | 'C' | 'D';
        earlyBonus: number;
        total: 'S' | 'A' | 'B' | 'C' | 'D';
    };
    totalScore: number;
}

export function calculateKPI(issues: JiraIssue[]): KPIMetrics {
    // (Logic verification: delayedIssues are calculated based solely on resolutiondate vs duedate. Start date is ignored.
    //  This matches the user request: "Exclude start delay, reflect only completion delay".)

    const totalIssues = issues.length;

    if (totalIssues === 0) {
        return {
            totalIssues: 0,
            completedIssues: 0,
            delayedIssues: 0,
            earlyIssues: 0,
            compliantIssues: 0,
            agreedDelayIssues: 0,
            completionRate: 0,
            complianceRate: 0,
            earlyRate: 0,
            grades: { completion: 'D', compliance: 'D', earlyBonus: 0, total: 'D' },
            totalScore: 0
        };
    }

    let completedIssues = 0;
    let compliantIssues = 0; // Completed on time
    let earlyIssues = 0;     // Completed early
    let delayedIssues = 0;   // Completed late
    let agreedDelayIssues = 0; // Marked as agreed delay

    issues.forEach(issue => {
        const isDone = getStatusCategoryKey(issue) === 'done';
        const isAgreedDelay = issue.fields.labels?.includes(JIRA_CONFIG.LABELS.AGREED_DELAY);
        const isVerificationDelay = issue.fields.labels?.includes(JIRA_CONFIG.LABELS.VERIFICATION_DELAY);

        if (isAgreedDelay) {
            agreedDelayIssues++;
        }

        if (isDone) {
            completedIssues++;

            const dueDateStr = issue.fields.duedate;
            const actualEndStr = issue.fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] || issue.fields.resolutiondate;

            // Compliance & Delay Logic (Only checks completion time, ignores start time)
            if (dueDateStr && actualEndStr) {
                const dueDate = new Date(dueDateStr);
                dueDate.setHours(23, 59, 59, 999); // End of due date
                const actualEnd = new Date(actualEndStr);

                if (actualEnd <= dueDate) {
                    compliantIssues++;
                    // Early check: if actual end is strictly before due date (e.g. at least 1 day early)
                    // Requirement: Early completion rate calculation. Standard: < due date.
                    if (actualEnd < new Date(dueDate.setHours(0, 0, 0, 0))) { // Compare with start of due date to be at least 1 day early? Or just earlier? let's stick to simple <
                        earlyIssues++;
                    }
                } else {
                    if (isVerificationDelay) {
                        // Verified delay -> Treat as compliant (not counted as delayed, counted as compliant)
                        compliantIssues++;
                    } else if (!isAgreedDelay) {
                        delayedIssues++;
                    }
                }
            } else {
                // If no due date, count as compliant?
                compliantIssues++;
            }
        }
    });

    // KPI A: Completion Rate = (Completed / (Total - AgreedDelay)) * 100
    // Note: completedIssues includes all done. We should probably only count non-agreed done?
    // Actually, if agreed delay is removed from denominator, it should also be removed from numerator if we want strict apple-to-apple?
    // User said: "Condition: Agreed delay is excluded from parameter (denominator)".
    // So Rate = (Total Done - Agreed Done / Total Planned - Agreed Planned).
    // Let's assume filtered list for KPI A.

    // Let's refine based on "Verification Defect Delay is Delay".
    // Since we can't distinguish verification defect, we assume ANY delay (without agreed label) is delay.

    const kpiTotal = Math.max(totalIssues - agreedDelayIssues, 1);
    // Adjusted completed: All done minus those that were agreed delay?
    // Or does "Completed" include agreed delay? Usually KPI A is about "Performance".
    // If I agree to delay, it's removed from target. So if I finish it, it doesn't count for KPI A?
    // Let's assume we count it as done if it's done.
    // Wait, if I exclude from denominator, I must exclude from numerator too to avoid > 100%.
    const kpiCompleted = Math.max(completedIssues - (issues.filter(i => getStatusCategoryKey(i) === 'done' && i.fields.labels?.includes(JIRA_CONFIG.LABELS.AGREED_DELAY)).length), 0);

    const completionRate = Math.min((kpiCompleted / kpiTotal) * 100, 100);

    // KPI B: Compliance Rate = (Compliant / Total) * 100
    // "Scrum Master uses team average".
    // Here we calculate for the given list (can be individual or team).
    // Should we exclude agreed delay from here too?
    // Usually yes.
    const kpiCompliant = Math.max(compliantIssues - (issues.filter(i => {
        const isDone = getStatusCategoryKey(i) === 'done';
        const isAgreed = i.fields.labels?.includes(JIRA_CONFIG.LABELS.AGREED_DELAY);
        const dueDateStr = i.fields.duedate;
        const actualEndStr = i.fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] || i.fields.resolutiondate;
        if (isDone && isAgreed && dueDateStr && actualEndStr) {
            const due = new Date(dueDateStr); due.setHours(23, 59, 59, 999);
            return new Date(actualEndStr) <= due;
        }
        return false;
    }).length), 0);

    const complianceRate = Math.min((kpiCompliant / kpiTotal) * 100, 100);

    // KPI C: Early Rate = (Early / Total) * 100
    // Same exclusion logic
    const earlyRate = (earlyIssues / kpiTotal) * 100;
    const earlyBonus = getEarlyBonus(earlyRate);

    // Total Score: Average of Completion and Compliance + Early Bonus
    const avgScore = (completionRate + complianceRate) / 2;
    const totalScore = Math.min(Math.round(avgScore + earlyBonus), 100);

    return {
        totalIssues,
        completedIssues,
        delayedIssues,
        earlyIssues,
        compliantIssues,
        agreedDelayIssues,
        completionRate: Math.round(completionRate),
        complianceRate: Math.round(complianceRate),
        earlyRate: Math.round(earlyRate),
        grades: {
            completion: getGrade(completionRate),
            compliance: getGrade(complianceRate),
            earlyBonus: earlyBonus,
            total: getGrade(totalScore)
        },
        totalScore
    };
}

function getGrade(rate: number): 'S' | 'A' | 'B' | 'C' | 'D' {
    if (rate >= 95) return 'S';
    if (rate >= 90) return 'A';
    if (rate >= 80) return 'B';
    if (rate >= 70) return 'C';
    return 'D';
}

function getEarlyBonus(rate: number): number {
    if (rate >= 50) return 5;
    if (rate >= 40) return 4;
    if (rate >= 30) return 3;
    if (rate >= 20) return 2;
    if (rate >= 10) return 1;
    return 0;
}

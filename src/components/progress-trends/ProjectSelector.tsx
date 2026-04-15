import { JIRA_CONFIG } from '@/config/jiraConfig';
import { useProjectSelectionStore } from '@/stores/projectSelectionStore';
import { Folder } from 'lucide-react';

export function ProjectSelector() {
    const selectedProjectKey = useProjectSelectionStore((s) => s.selectedProjectKey);
    const setSelectedProjectKey = useProjectSelectionStore((s) => s.setSelectedProjectKey);

    return (
        <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-slate-500" />
            <label htmlFor="project-selector" className="text-sm font-medium text-slate-700">
                프로젝트:
            </label>
            <select
                id="project-selector"
                value={selectedProjectKey}
                onChange={(e) => setSelectedProjectKey(e.target.value)}
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
                {JIRA_CONFIG.PROJECT_KEYS.map((pk) => (
                    <option key={pk} value={pk}>
                        {pk}
                    </option>
                ))}
            </select>
        </div>
    );
}

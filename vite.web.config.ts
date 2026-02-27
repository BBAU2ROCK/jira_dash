import { defineConfig, Plugin } from 'vite'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import net from 'node:net'
import react from '@vitejs/plugin-react'

// Vite Plugin: Auto-start proxy-server.cjs when Vite dev server starts
function proxyServerPlugin(): Plugin {
    let proxyProcess: ChildProcess | null = null;

    function checkPortInUse(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(true));   // port in use
            server.once('listening', () => {
                server.close(() => resolve(false));       // port free
            });
            server.listen(port);
        });
    }

    return {
        name: 'proxy-server',
        async configureServer() {
            // We'll just try to start it. If port 3001 is truly in use by another proxy session,
            // the new one will just fail to bind and log an error to the console.
            console.log('\n[proxy-server] Attempting to start proxy-server.cjs on port 3001...\n');
            proxyProcess = spawn(
                'node',
                [path.resolve(__dirname, 'proxy-server.cjs')],
                { stdio: 'inherit', shell: false }
            );
            proxyProcess.on('error', (err) =>
                console.error('[proxy-server] Error:', err.message)
            );
            proxyProcess.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    console.log(`[proxy-server] Process exited with code ${code}`);
                }
                proxyProcess = null;
            });
        },
        closeBundle() {
            if (proxyProcess) {
                proxyProcess.kill();
                proxyProcess = null;
            }
        },
    };
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        proxyServerPlugin(),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
})

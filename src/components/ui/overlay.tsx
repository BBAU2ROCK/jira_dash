

export const Overlay = () => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto">
            <div className="relative flex flex-col items-center">
                {/* Pendulum Pivot Point */}
                <div className="w-1 h-1 bg-white rounded-full mb-1"></div>

                {/* Pendulum String & Bob */}
                <div className="animate-pendulum origin-top h-16 w-1">
                    <div className="h-full w-[2px] bg-white/50 mx-auto"></div>
                    <div className="w-6 h-6 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] -ml-[11px] -mt-1"></div>
                </div>

                <p className="mt-8 text-white font-medium tracking-wider text-sm">SYNCING...</p>
            </div>
        </div>
    );
};

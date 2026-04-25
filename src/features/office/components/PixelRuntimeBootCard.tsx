"use client";

type PixelRuntimeBootCardProps = {
  title?: string;
  subtitle?: string;
};

const agentSpriteSheet = "/office-assets/pixel/agents.png";
const objectSpriteSheet = "/office-assets/pixel/objects.png";

const spriteStyle = (
  sheet: string,
  frame: number,
  frameWidth: number,
  frameHeight: number,
  totalFrames: number,
) => ({
  backgroundImage: `url(${sheet})`,
  backgroundPosition: `-${frame * frameWidth}px 0`,
  backgroundRepeat: "no-repeat",
  backgroundSize: `${frameWidth * totalFrames}px ${frameHeight}px`,
  imageRendering: "pixelated" as const,
});

export function PixelRuntimeBootCard({
  subtitle = "Syncing desks, signs, and agent channels.",
  title = "Connecting to runtime",
}: PixelRuntimeBootCardProps) {
  return (
    <div className="relative w-[min(420px,calc(100vw-2rem))] border-4 border-[#d7b25a] bg-[#1b140f]/96 p-5 font-mono shadow-[0_14px_0_rgba(0,0,0,0.34)] backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-3 border-b-4 border-[#6a4a1d] bg-[#8b5b2c]" />
      <div className="mt-4 flex items-start gap-4">
        <div className="relative shrink-0">
          <div className="h-16 w-12" style={spriteStyle(agentSpriteSheet, 3, 48, 64, 4)} />
          <div className="absolute -bottom-2 left-1/2 h-2 w-8 -translate-x-1/2 rounded-full bg-black/30 blur-[1px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-black uppercase tracking-[0.12em] text-[#ffe08a]">
            {title}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#f3dfb3]">{subtitle}</p>
          <div className="mt-4 space-y-2">
            <div className="h-3 overflow-hidden border-2 border-[#2d2419] bg-[#0f0b08]">
              <div className="h-full w-[76%] bg-[#d7b25a]" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="h-2 border border-[#2d2419] bg-[#d7b25a]" />
              <div className="h-2 border border-[#2d2419] bg-[#d7b25a]" />
              <div className="h-2 border border-[#2d2419] bg-[#d7b25a]" />
              <div className="h-2 border border-[#2d2419] bg-[#3a2e21]" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t-2 border-[#3d2d1d] pt-4 text-[10px] uppercase tracking-[0.08em] text-[#c9b081]">
        <span>Office boot sequence</span>
        <div
          className="h-10 w-10"
          style={spriteStyle(objectSpriteSheet, 4, 96, 96, 8)}
          aria-hidden
        />
      </div>
    </div>
  );
}

"use client";

import {
  Bot,
  MessageSquare,
  Pencil,
  Plus,
  Radio,
  Users,
  WifiOff,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { OfficeAgent } from "@/features/retro-office/core/types";

type PixelOffice2DProps = {
  agents: OfficeAgent[];
  connectPromptOpen?: boolean;
  officeTitle?: string;
  officeTitleLoaded?: boolean;
  gatewayStatus?: string;
  runCountByAgentId?: Record<string, number>;
  lastSeenByAgentId?: Record<string, number>;
  streamingTextByAgentId?: Record<string, string | null>;
  onAddAgent?: () => void;
  onAgentChatSelect?: (agentId: string) => void;
  onAgentDelete?: (agentId: string) => void;
  onAgentEdit?: (agentId: string) => void;
  onMonitorSelect?: (agentId: string | null) => void;
  onStandupStartRequested?: () => void;
  onStandupArrivalsChange?: (arrivedAgentIds: string[]) => void;
  onTaskBoardSelectCard?: (cardId: string | null) => void;
  onGatewayConnect?: () => void;
  onGatewayDisconnect?: () => void;
  onVoiceRepliesPreview?: (voiceId: string | null, voiceName: string) => void;
  [key: string]: unknown;
};

type SectorTheme = {
  id: string;
  label: string;
  subtitle: string;
  capacity: number;
  color: string;
  bg: string;
  border: string;
  icon: "heart" | "rocket" | "eye";
};

type AgentSlot = {
  x: number;
  y: number;
};

const sectors: SectorTheme[] = [
  {
    id: "alyx-med",
    label: "SETOR 1",
    subtitle: "ALYX MED",
    capacity: 6,
    color: "#b8ff8f",
    bg: "rgba(58, 118, 54, 0.72)",
    border: "#77bd60",
    icon: "heart",
  },
  {
    id: "next-boost",
    label: "SETOR 2",
    subtitle: "NEXT BOOST",
    capacity: 5,
    color: "#88d8ff",
    bg: "rgba(49, 93, 133, 0.76)",
    border: "#5ca5df",
    icon: "rocket",
  },
  {
    id: "next-vision",
    label: "SETOR 3",
    subtitle: "NEXT VISION",
    capacity: 5,
    color: "#e1a6ff",
    bg: "rgba(96, 55, 126, 0.76)",
    border: "#b46ad6",
    icon: "eye",
  },
];

const sectorSlots: Record<string, AgentSlot[]> = {
  "alyx-med": [
    { x: 12.5, y: 30 },
    { x: 20.5, y: 30 },
    { x: 28.5, y: 30 },
    { x: 12.5, y: 42 },
    { x: 20.5, y: 42 },
    { x: 28.5, y: 42 },
  ],
  "next-boost": [
    { x: 73, y: 30 },
    { x: 82, y: 30 },
    { x: 91, y: 30 },
    { x: 73, y: 42 },
    { x: 82, y: 42 },
  ],
  "next-vision": [
    { x: 12.5, y: 73 },
    { x: 20.5, y: 73 },
    { x: 28.5, y: 73 },
    { x: 16.5, y: 80 },
    { x: 25, y: 80 },
  ],
};

const agentSpriteSheet = "/office-assets/pixel/agents.png";
const objectSpriteSheet = "/office-assets/pixel/objects.png";
const agentSpriteFrame = { width: 48, height: 64, count: 4 };
const objectSpriteFrame = { width: 96, height: 96, count: 8 };

const pixelTextShadow = {
  textShadow: "2px 0 #1a1510, -2px 0 #1a1510, 0 2px #1a1510, 0 -2px #1a1510",
};

const tileFloor = (base: string, line: string): CSSProperties => ({
  backgroundColor: base,
  backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
  backgroundSize: "32px 32px",
});

const splitAgents = (agents: OfficeAgent[]) => {
  const visible = agents.slice(0, 16);
  return {
    "alyx-med": visible.slice(0, 6),
    "next-boost": visible.slice(6, 11),
    "next-vision": visible.slice(11, 16),
    overflowCount: Math.max(0, agents.length - 16),
  };
};

const statusLabel = (status: OfficeAgent["status"]) => {
  if (status === "working") return "trabalhando";
  if (status === "error") return "alerta";
  return "pronto";
};

const iconForSector = (icon: SectorTheme["icon"]) => {
  if (icon === "rocket") return ">>";
  if (icon === "eye") return "<>";
  return "++";
};

const formatLastSeen = (timestamp: number | undefined) => {
  if (!timestamp) return "sem atividade";
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "agora";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
};

const sheetStyle = ({
  frame,
  frameHeight,
  frameWidth,
  sheet,
  totalFrames,
}: {
  frame: number;
  frameHeight: number;
  frameWidth: number;
  sheet: string;
  totalFrames: number;
}): CSSProperties => ({
  backgroundImage: `url(${sheet})`,
  backgroundPosition: `-${frame * frameWidth}px 0`,
  backgroundRepeat: "no-repeat",
  backgroundSize: `${frameWidth * totalFrames}px ${frameHeight}px`,
  imageRendering: "pixelated",
});

function ObjectSprite({
  className = "",
  frame,
  height = 96,
  extraStyle,
  title,
  width = 96,
  x,
  y,
}: AgentSlot & {
  className?: string;
  extraStyle?: CSSProperties;
  frame: number;
  height?: number;
  title?: string;
  width?: number;
}) {
  return (
    <div
      aria-hidden={title ? undefined : true}
      className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 ${className}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width,
        height,
        ...sheetStyle({
          frame,
          frameHeight: objectSpriteFrame.height,
          frameWidth: objectSpriteFrame.width,
          sheet: objectSpriteSheet,
          totalFrames: objectSpriteFrame.count,
        }),
        ...extraStyle,
      }}
      title={title}
    />
  );
}

function PixelSign({
  capacity,
  count,
  theme,
}: {
  capacity: number;
  count: number;
  theme: SectorTheme;
}) {
  return (
    <div
      className="absolute left-5 top-5 z-20 min-w-[178px] border-4 px-4 py-3 font-mono uppercase shadow-[0_6px_0_rgba(0,0,0,0.35)]"
      style={{
        backgroundColor: "#11200f",
        borderColor: theme.border,
        color: theme.color,
        imageRendering: "pixelated",
      }}
    >
      <div className="text-center text-[13px] font-black tracking-[0.12em]">
        {theme.label}
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-[17px] font-black tracking-[0.08em]">
        <span>{iconForSector(theme.icon)}</span>
        <span>{theme.subtitle}</span>
      </div>
      <div className="mt-3 text-center text-[10px] leading-4 text-white/90">
        CAPACIDADE MAXIMA
        <br />
        {count}/{capacity} AGENTES
      </div>
    </div>
  );
}

function Room({
  children,
  className = "",
  label,
  style,
}: {
  children?: ReactNode;
  className?: string;
  label?: string;
  style: CSSProperties;
}) {
  return (
    <section
      className={`absolute overflow-hidden border-[5px] border-[#2f261c] shadow-[inset_0_0_0_3px_rgba(255,255,255,0.18),0_8px_0_rgba(0,0,0,0.25)] ${className}`}
      style={style}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-8 border-b-4 border-[#2f261c] bg-[#83613e]" />
      {label ? (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 border-4 border-[#2a2117] bg-[#2a2117] px-5 py-1 font-mono text-[15px] font-black uppercase tracking-[0.08em] text-[#ffe08a] shadow-[0_4px_0_rgba(0,0,0,0.35)]">
          {label}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function PixelDesk({ x, y }: AgentSlot) {
  return (
    <ObjectSprite frame={0} x={x} y={y} title="desk" />
  );
}

function PixelAgentSprite({
  agent,
  lastSeen,
  onChat,
  onEdit,
  runCount,
  streamingText,
  x,
  y,
}: AgentSlot & {
  agent: OfficeAgent;
  lastSeen?: number;
  onChat?: (agentId: string) => void;
  onEdit?: (agentId: string) => void;
  runCount?: number;
  streamingText?: string | null;
}) {
  const frame =
    agent.status === "working"
      ? 1
      : agent.status === "error"
        ? 2
        : Math.abs(agent.id.charCodeAt(0) ?? 0) % 2;
  const statusColor =
    agent.status === "working"
      ? "bg-[#55dc78]"
      : agent.status === "error"
        ? "bg-[#ff6565]"
        : "bg-[#f0d878]";

  return (
    <div
      className="group absolute z-40 -translate-x-1/2 -translate-y-full"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <button
        type="button"
        className="relative block h-16 w-12 cursor-pointer outline-none transition-transform hover:-translate-y-1 focus-visible:-translate-y-1"
        aria-label={`Abrir chat de ${agent.name}`}
        title={`${agent.name} - ${statusLabel(agent.status)}`}
        onClick={() => onChat?.(agent.id)}
        style={{
          ...sheetStyle({
            frame,
            frameHeight: agentSpriteFrame.height,
            frameWidth: agentSpriteFrame.width,
            sheet: agentSpriteSheet,
            totalFrames: agentSpriteFrame.count,
          }),
          animation: `pixel-float ${2.4 + (agent.id.length % 3) * 0.35}s ease-in-out infinite`,
        }}
      >
        <span
          className={`absolute -right-1 top-0 h-3 w-3 border-2 border-[#17120f] ${statusColor}`}
        />
      </button>
      <div className="pointer-events-none absolute left-1/2 top-[58px] min-w-[96px] -translate-x-1/2 border-2 border-[#1f1a13] bg-[#f4e4b5] px-2 py-1 text-center font-mono text-[10px] font-black leading-3 text-[#2f261c] shadow-[0_3px_0_rgba(0,0,0,0.28)]">
        {agent.name}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-[-42px] hidden w-[170px] -translate-x-1/2 border-2 border-[#1d1710] bg-[#1d1710]/95 p-2 font-mono text-[10px] text-[#f5e6bd] shadow-xl group-hover:block group-focus-within:block">
        <div className="font-black uppercase text-[#ffe08a]">{agent.name}</div>
        <div className="mt-1 text-white/80">
          {statusLabel(agent.status)} | runs {runCount ?? 0} | visto {formatLastSeen(lastSeen)}
        </div>
        {streamingText ? (
          <div className="mt-1 line-clamp-2 text-[#9de7ff]">{streamingText}</div>
        ) : null}
      </div>
      {onEdit ? (
        <button
          type="button"
          className="absolute -right-7 top-2 hidden h-7 w-7 place-items-center border-2 border-[#1d1710] bg-[#f3d27a] text-[#1d1710] shadow-[0_3px_0_rgba(0,0,0,0.35)] group-hover:grid group-focus-within:grid"
          aria-label={`Editar ${agent.name}`}
          title="Editar agente"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(agent.id);
          }}
        >
          <Pencil size={14} strokeWidth={3} />
        </button>
      ) : null}
    </div>
  );
}

function Receptionist() {
  return (
    <div className="absolute left-1/2 top-[25%] z-30 -translate-x-1/2 -translate-y-1/2">
      <div
        className="relative h-16 w-12"
        style={{
          ...sheetStyle({
            frame: 3,
            frameHeight: agentSpriteFrame.height,
            frameWidth: agentSpriteFrame.width,
            sheet: agentSpriteSheet,
            totalFrames: agentSpriteFrame.count,
          }),
          animation: "pixel-float 2.8s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function Plant({ x, y }: AgentSlot) {
  return <ObjectSprite className="z-30" frame={1} x={x} y={y} title="plant" />;
}

function Bookshelf({ x, y }: AgentSlot) {
  return <ObjectSprite frame={2} x={x} y={y} title="bookshelf" />;
}

function MeetingTable() {
  return (
    <div className="absolute left-1/2 top-[72%] z-20 h-[146px] w-[112px] -translate-x-1/2 -translate-y-1/2">
      <div
        className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2"
        style={sheetStyle({
          frame: 6,
          frameHeight: objectSpriteFrame.height,
          frameWidth: objectSpriteFrame.width,
          sheet: objectSpriteSheet,
          totalFrames: objectSpriteFrame.count,
        })}
      />
      {[
        ["-38px", "14px"],
        ["-38px", "58px"],
        ["-38px", "102px"],
        ["118px", "14px"],
        ["118px", "58px"],
        ["118px", "102px"],
      ].map(([left, top]) => (
        <span
          key={`${left}-${top}`}
          className="absolute h-8 w-7 border-3 border-[#14202b] bg-[#2b5475]"
          style={{ left, top }}
        />
      ))}
    </div>
  );
}

export function PixelOffice2D({
  agents,
  connectPromptOpen = false,
  gatewayStatus = "disconnected",
  lastSeenByAgentId = {},
  officeTitle = "CLAW3D",
  officeTitleLoaded = false,
  onAddAgent,
  onAgentChatSelect,
  onAgentEdit,
  onGatewayConnect,
  onGatewayDisconnect,
  onMonitorSelect,
  onStandupStartRequested,
  runCountByAgentId = {},
  streamingTextByAgentId = {},
}: PixelOffice2DProps) {
  const split = splitAgents(agents);
  const connected = gatewayStatus === "connected";
  const workingCount = agents.filter((agent) => agent.status === "working").length;
  const errorCount = agents.filter((agent) => agent.status === "error").length;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#111315] text-[#f7ebc8]">
      <div className="absolute left-3 top-3 z-50 flex flex-wrap items-center gap-2 font-mono">
        <button
          type="button"
          className="grid h-10 w-10 place-items-center border-2 border-[#3b2b1d] bg-[#f1cf72] text-[#24180f] shadow-[0_4px_0_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5"
          onClick={onAddAgent}
          title="Adicionar agente"
          aria-label="Adicionar agente"
        >
          <Plus size={17} strokeWidth={3} />
        </button>
        {connected ? (
          <button
            type="button"
            className="grid h-10 w-10 place-items-center border-2 border-[#244b32] bg-[#58c46e] text-[#102111] shadow-[0_4px_0_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5"
            onClick={onGatewayDisconnect}
            title="Desconectar runtime"
            aria-label="Desconectar runtime"
          >
            <Radio size={17} strokeWidth={3} />
          </button>
        ) : (
          <button
            type="button"
            className="grid h-10 w-10 place-items-center border-2 border-[#4a2b2b] bg-[#e06d5d] text-[#2a1111] shadow-[0_4px_0_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5"
            onClick={onGatewayConnect}
            title="Conectar runtime"
            aria-label="Conectar runtime"
          >
            <WifiOff size={17} strokeWidth={3} />
          </button>
        )}
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
        <div
          className="relative aspect-[16/10] max-h-full w-full max-w-[1560px] overflow-hidden border-[6px] border-[#e8e0cf] bg-[#2a241d] shadow-[0_0_0_5px_#5d5448,0_18px_0_rgba(0,0,0,0.45)]"
          style={{ imageRendering: "pixelated" }}
        >
          <div className="absolute inset-x-0 bottom-0 h-[13%] bg-[#3a7a3d]" />
          {Array.from({ length: 11 }).map((_, index) => (
            <ObjectSprite
              key={index}
              extraStyle={{
                animation: `pixel-sway ${3.6 + (index % 3) * 0.5}s ease-in-out infinite`,
                transformOrigin: "bottom center",
              }}
              frame={7}
              className="z-10"
              x={4 + index * 9}
              y={92}
            />
          ))}

          <Room
            style={{
              left: "3%",
              top: "5%",
              width: "32%",
              height: "42%",
              ...tileFloor("#40783f", "rgba(255,255,255,0.08)"),
            }}
          >
            <PixelSign capacity={sectors[0].capacity} count={split["alyx-med"].length} theme={sectors[0]} />
            {sectorSlots["alyx-med"].map((slot, index) => (
              <PixelDesk key={`alyx-desk-${index}`} {...slot} />
            ))}
            {split["alyx-med"].map((agent, index) => (
              <PixelAgentSprite
                key={agent.id}
                agent={agent}
                lastSeen={lastSeenByAgentId[agent.id]}
                onChat={onAgentChatSelect}
                onEdit={onAgentEdit}
                runCount={runCountByAgentId[agent.id]}
                streamingText={streamingTextByAgentId[agent.id]}
                {...sectorSlots["alyx-med"][index]!}
              />
            ))}
            <Bookshelf x={25} y={20} />
            <Plant x={7} y={83} />
          </Room>

          <Room
            style={{
              left: "65%",
              top: "5%",
              width: "32%",
              height: "42%",
              ...tileFloor("#3d6992", "rgba(255,255,255,0.08)"),
            }}
          >
            <PixelSign capacity={sectors[1].capacity} count={split["next-boost"].length} theme={sectors[1]} />
            {sectorSlots["next-boost"].map((slot, index) => (
              <PixelDesk key={`boost-desk-${index}`} {...slot} />
            ))}
            {split["next-boost"].map((agent, index) => (
              <PixelAgentSprite
                key={agent.id}
                agent={agent}
                lastSeen={lastSeenByAgentId[agent.id]}
                onChat={onAgentChatSelect}
                onEdit={onAgentEdit}
                runCount={runCountByAgentId[agent.id]}
                streamingText={streamingTextByAgentId[agent.id]}
                {...sectorSlots["next-boost"][index]!}
              />
            ))}
            <Bookshelf x={24} y={21} />
            <Plant x={94} y={83} />
            <ObjectSprite frame={3} x={91} y={61} title="water cooler" />
          </Room>

          <Room
            style={{
              left: "3%",
              top: "52%",
              width: "32%",
              height: "32%",
              ...tileFloor("#604080", "rgba(255,255,255,0.07)"),
            }}
          >
            <PixelSign capacity={sectors[2].capacity} count={split["next-vision"].length} theme={sectors[2]} />
            {sectorSlots["next-vision"].map((slot, index) => (
              <PixelDesk key={`vision-desk-${index}`} {...slot} />
            ))}
            {split["next-vision"].map((agent, index) => (
              <PixelAgentSprite
                key={agent.id}
                agent={agent}
                lastSeen={lastSeenByAgentId[agent.id]}
                onChat={onAgentChatSelect}
                onEdit={onAgentEdit}
                runCount={runCountByAgentId[agent.id]}
                streamingText={streamingTextByAgentId[agent.id]}
                {...sectorSlots["next-vision"][index]!}
              />
            ))}
            <Bookshelf x={70} y={25} />
          </Room>

          <Room
            style={{
              left: "35%",
              top: "5%",
              width: "30%",
              height: "42%",
              ...tileFloor("#d6cbb5", "rgba(77,62,42,0.16)"),
            }}
          >
            <div className="absolute left-1/2 top-[10%] z-20 -translate-x-1/2 border-4 border-[#2f261c] bg-[#f1dfbd] px-12 py-5 text-center font-mono uppercase text-[#17202a] shadow-[0_5px_0_rgba(0,0,0,0.32)]">
              <div className="text-[26px] font-black tracking-[0.08em]" style={pixelTextShadow}>
                {officeTitleLoaded ? officeTitle : "CLAW3D"}
              </div>
              <div className="mt-1 text-[12px] font-black tracking-[0.18em]">
                AI AGENTS OFFICE
              </div>
            </div>
            <Plant x={18} y={43} />
            <Plant x={82} y={43} />
            <div className="absolute left-1/2 top-[53%] z-20 h-[76px] w-[190px] -translate-x-1/2 border-4 border-[#3d2818] bg-[#76512c] shadow-[0_7px_0_rgba(0,0,0,0.35)]">
              <div className="absolute right-4 top-3 h-11 w-9 border-3 border-[#111820] bg-[#263b4c]" />
              <div className="absolute left-5 top-4 h-8 w-9 bg-[#4b8d40]" />
            </div>
            <Receptionist />
            <button
              type="button"
              className="absolute left-1/2 top-[72%] z-30 -translate-x-1/2 border-4 border-[#c7a368] bg-[#3f5e76] px-14 py-4 font-mono text-[20px] font-black uppercase tracking-[0.08em] text-white shadow-[0_6px_0_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-1"
              onClick={() => onMonitorSelect?.(null)}
            >
              RECEPCAO
            </button>
          </Room>

          <Room
            label="SALA DE REUNIAO GERAL"
            style={{
              left: "38%",
              top: "52%",
              width: "24%",
              height: "32%",
              ...tileFloor("#8a5d31", "rgba(255,255,255,0.08)"),
            }}
          >
            <MeetingTable />
            <button
              type="button"
              className="absolute left-1/2 top-[18%] z-30 grid h-11 w-20 -translate-x-1/2 place-items-center border-4 border-[#152234] bg-[#6aa7d3] text-[#101820] shadow-[0_5px_0_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-1"
              onClick={onStandupStartRequested}
              title="Iniciar reuniao"
              aria-label="Iniciar reuniao"
            >
              <Users size={22} strokeWidth={3} />
            </button>
          </Room>

          <Room
            style={{
              left: "65%",
              top: "52%",
              width: "32%",
              height: "32%",
              ...tileFloor("#77706a", "rgba(255,255,255,0.08)"),
            }}
          >
            <div className="absolute left-[13%] top-[19%] z-20 w-[220px] border-4 border-[#1e1b18] bg-[#2e3030] p-4 font-mono uppercase text-[#e9f3df] shadow-[0_5px_0_rgba(0,0,0,0.35)]">
              <div className="text-center text-[15px] font-black">INFORMACOES</div>
              <div className="mt-3 space-y-1 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 bg-[#66cc67]" />
                  {sectors.length} SETORES ATIVOS
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 bg-[#60b9ff]" />
                  {agents.length} AGENTES
                </div>
                <div className="flex items-center gap-2">
                  <span className={errorCount > 0 ? "h-3 w-3 bg-[#ff6b61]" : "h-3 w-3 bg-[#66cc67]"} />
                  {errorCount > 0 ? `${errorCount} ALERTAS` : "OPERACAO NORMAL"}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="absolute bottom-[18%] left-[49%] z-30 h-24 w-24 border-0 text-[#1d1710] transition-transform hover:-translate-y-1"
              style={sheetStyle({
                frame: 5,
                frameHeight: objectSpriteFrame.height,
                frameWidth: objectSpriteFrame.width,
                sheet: objectSpriteSheet,
                totalFrames: objectSpriteFrame.count,
              })}
              onClick={() => agents[0] && onMonitorSelect?.(agents[0].id)}
              title="Abrir monitor"
              aria-label="Abrir monitor"
            />
            <div className="absolute right-[8%] top-[18%] border-4 border-[#2b251d] bg-[#eedfc1] p-4 text-center font-mono text-[12px] font-black uppercase text-[#2b251d]">
              AUTONOMIA
              <br />
              FOCO
              <br />
              RESULTADOS
              <div className="mt-3 flex justify-center gap-1">
                <Bot size={18} />
                <Bot size={18} />
                <Bot size={18} />
              </div>
            </div>
          </Room>

          <div className="absolute bottom-[13%] left-1/2 h-16 w-36 -translate-x-1/2 border-4 border-[#1c2b38] bg-[#416f92] shadow-[0_6px_0_rgba(0,0,0,0.35)]" />
          <div className="absolute bottom-[13%] left-[46.6%] h-16 w-[3px] bg-[#d7f0ff]" />
          <div className="absolute bottom-[8%] left-1/2 h-10 w-[520px] -translate-x-1/2 bg-[#b7b0a4]" />
          {split.overflowCount > 0 ? (
            <div className="absolute bottom-[18%] right-[4%] z-50 border-4 border-[#2f261c] bg-[#f1cf72] px-4 py-2 font-mono text-[12px] font-black uppercase text-[#2f261c] shadow-[0_5px_0_rgba(0,0,0,0.35)]">
              +{split.overflowCount} agentes fora da tela
            </div>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-50 border-2 border-[#3b2b1d] bg-[#191510]/90 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#f4e3b2] shadow-xl">
        <span className={connected ? "text-[#77e083]" : "text-[#ff9185]"}>
          {connected ? "online" : "offline"}
        </span>
        <span className="mx-2 text-white/30">|</span>
        {workingCount} trabalhando
      </div>

      {agents.length === 0 && !connectPromptOpen ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-[620px] items-center justify-between gap-4 border-4 border-[#f1cf72] bg-[#191510]/92 px-4 py-3 font-mono shadow-2xl backdrop-blur">
            <div className="min-w-0">
              <div className="text-[15px] font-black uppercase tracking-[0.1em] text-[#ffe08a]">
                Escritorio 2D pronto
              </div>
              <p className="mt-1 text-xs leading-5 text-[#f4e3b2]">
                Conecte o runtime ou adicione agentes para popular os setores.
              </p>
            </div>
            {onAddAgent ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-2 border-2 border-[#3b2b1d] bg-[#f1cf72] px-4 py-2 text-xs font-black uppercase text-[#24180f] shadow-[0_4px_0_rgba(0,0,0,0.35)]"
                onClick={onAddAgent}
              >
                <Plus size={15} strokeWidth={3} />
                Add agent
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="absolute bottom-3 right-3 z-50 grid h-10 w-10 place-items-center border-2 border-[#3b2b1d] bg-[#f1cf72] text-[#24180f] shadow-[0_4px_0_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5"
        onClick={() => agents[0] && onAgentChatSelect?.(agents[0].id)}
        title="Abrir chat"
        aria-label="Abrir chat"
      >
        <MessageSquare size={17} strokeWidth={3} />
      </button>
    </div>
  );
}

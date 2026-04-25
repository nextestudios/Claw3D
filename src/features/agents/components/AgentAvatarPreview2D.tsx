"use client";

import { useMemo } from "react";

import {
  type AgentAvatarProfile,
  createDefaultAgentAvatarProfile,
} from "@/lib/avatars/profile";

export const AgentAvatarPreview2D = ({
  profile,
  className = "",
}: {
  profile: AgentAvatarProfile | null | undefined;
  className?: string;
}) => {
  const resolvedProfile = useMemo(
    () => profile ?? createDefaultAgentAvatarProfile("preview"),
    [profile],
  );
  const { accessories, body, clothing, hair } = resolvedProfile;

  return (
    <div
      className={`relative overflow-hidden bg-[#101820] ${className}`}
      style={{ imageRendering: "pixelated" }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(#1d2c38_1px,transparent_1px),linear-gradient(90deg,#1d2c38_1px,transparent_1px)] bg-[length:24px_24px]" />
      <div className="absolute inset-x-6 bottom-9 h-8 border-4 border-[#1f1810] bg-[#6f4d2a] shadow-[0_6px_0_rgba(0,0,0,0.35)]" />
      <div className="absolute left-1/2 top-1/2 h-[248px] w-[144px] -translate-x-1/2 -translate-y-1/2">
        {accessories.backpack ? (
          <div
            className="absolute left-[13px] top-[92px] h-[78px] w-[118px] border-4 border-[#17120e]"
            style={{ backgroundColor: "#263243" }}
          />
        ) : null}

        <div
          className="absolute left-[42px] top-[12px] h-[64px] w-[60px] border-4 border-[#17120e]"
          style={{ backgroundColor: body.skinTone }}
        />
        <div
          className="absolute left-[36px] top-[4px] h-[26px] w-[72px] border-4 border-[#17120e]"
          style={{ backgroundColor: hair.color }}
        />
        {hair.style === "spiky" ? (
          <>
            <div
              className="absolute left-[38px] top-[-10px] h-[20px] w-[16px] border-4 border-[#17120e]"
              style={{ backgroundColor: hair.color }}
            />
            <div
              className="absolute left-[63px] top-[-14px] h-[24px] w-[16px] border-4 border-[#17120e]"
              style={{ backgroundColor: hair.color }}
            />
            <div
              className="absolute left-[88px] top-[-10px] h-[20px] w-[16px] border-4 border-[#17120e]"
              style={{ backgroundColor: hair.color }}
            />
          </>
        ) : null}
        {hair.style === "bun" ? (
          <div
            className="absolute right-[18px] top-[14px] h-[26px] w-[26px] border-4 border-[#17120e]"
            style={{ backgroundColor: hair.color }}
          />
        ) : null}
        {accessories.hatStyle !== "none" ? (
          <div
            className="absolute left-[33px] top-[-7px] h-[20px] w-[78px] border-4 border-[#17120e]"
            style={{ backgroundColor: clothing.topColor }}
          />
        ) : null}
        <div className="absolute left-[55px] top-[37px] h-[8px] w-[8px] bg-[#17120e]" />
        <div className="absolute right-[55px] top-[37px] h-[8px] w-[8px] bg-[#17120e]" />
        {accessories.glasses ? (
          <>
            <div className="absolute left-[47px] top-[32px] h-[18px] w-[20px] border-4 border-[#17120e]" />
            <div className="absolute right-[47px] top-[32px] h-[18px] w-[20px] border-4 border-[#17120e]" />
            <div className="absolute left-[67px] top-[40px] h-[4px] w-[10px] bg-[#17120e]" />
          </>
        ) : null}
        <div className="absolute left-[56px] top-[58px] h-[5px] w-[32px] bg-[#8a4a3f]" />

        <div
          className="absolute left-[30px] top-[82px] h-[82px] w-[84px] border-4 border-[#17120e]"
          style={{ backgroundColor: clothing.topColor }}
        />
        {clothing.topStyle === "jacket" ? (
          <>
            <div className="absolute left-[66px] top-[86px] h-[76px] w-[12px] bg-[#17120e]" />
            <div className="absolute left-[78px] top-[86px] h-[76px] w-[9px] bg-white/20" />
          </>
        ) : null}
        {clothing.topStyle === "hoodie" ? (
          <div className="absolute left-[44px] top-[83px] h-[30px] w-[56px] border-4 border-[#17120e] bg-black/15" />
        ) : null}

        <div
          className="absolute left-[13px] top-[92px] h-[70px] w-[28px] border-4 border-[#17120e]"
          style={{ backgroundColor: clothing.topColor }}
        />
        <div
          className="absolute right-[13px] top-[92px] h-[70px] w-[28px] border-4 border-[#17120e]"
          style={{ backgroundColor: clothing.topColor }}
        />
        <div className="absolute left-[19px] top-[154px] h-[20px] w-[18px] border-4 border-[#17120e]" style={{ backgroundColor: body.skinTone }} />
        <div className="absolute right-[19px] top-[154px] h-[20px] w-[18px] border-4 border-[#17120e]" style={{ backgroundColor: body.skinTone }} />

        <div
          className="absolute left-[35px] top-[160px] h-[54px] w-[30px] border-4 border-[#17120e]"
          style={{ backgroundColor: clothing.bottomColor }}
        />
        <div
          className="absolute right-[35px] top-[160px] h-[54px] w-[30px] border-4 border-[#17120e]"
          style={{ backgroundColor: clothing.bottomColor }}
        />
        <div
          className="absolute left-[31px] top-[210px] h-[18px] w-[38px] border-4 border-[#17120e]"
          style={{ backgroundColor: clothing.shoesColor }}
        />
        <div
          className="absolute right-[31px] top-[210px] h-[18px] w-[38px] border-4 border-[#17120e]"
          style={{ backgroundColor: clothing.shoesColor }}
        />

        {accessories.headset ? (
          <>
            <div className="absolute left-[33px] top-[28px] h-[42px] w-[10px] bg-[#17120e]" />
            <div className="absolute right-[33px] top-[28px] h-[42px] w-[10px] bg-[#17120e]" />
            <div className="absolute right-[24px] top-[54px] h-[8px] w-[26px] bg-[#17120e]" />
          </>
        ) : null}
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 border-2 border-[#1f1810] bg-[#f4d47c] px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-[#21170f] shadow-[0_3px_0_rgba(0,0,0,0.35)]">
        2D sprite preview
      </div>
    </div>
  );
};

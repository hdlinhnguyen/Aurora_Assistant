"use client";

/**
 * CharacterContext — cho phép shell (Learning Flow) chọn nhân vật đồng hành (Nấm/Cừu)
 * và mọi màn con (Hub, Fraction Lab, Badges…) dùng chung. Trang lẻ không có Provider
 * sẽ mặc định "nam".
 */

import { createContext, useContext } from "react";
import type { CharKind } from "./Character";

export const CharacterContext = createContext<CharKind>("nam");

export function useCharacter(): CharKind {
  return useContext(CharacterContext);
}

/** Tên hiển thị + emoji của nhân vật (dùng cho text/tiêu đề). */
export function characterMeta(char: CharKind): { name: string; emoji: string } {
  return char === "sheep" ? { name: "bạn Cừu", emoji: "🐑" } : { name: "bạn Nấm", emoji: "🍄" };
}

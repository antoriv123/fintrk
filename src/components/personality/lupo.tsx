"use client";

import { motion, useReducedMotion } from "motion/react";

// Lupo: la mascota guia de Fintrk. Lobo verde bosque alineado con la marca
// (#2D6A4F primary + #84CC16 acento + #FFB547 calido). SVG inline parametrico
// — un solo componente maneja todos los estados cambiando boca/ojos/accesorios.
// Si en el futuro se quiere reemplazar el dibujo por una ilustracion
// pulida, basta sustituir el contenido del <svg> manteniendo el contrato
// de props (state + size).

export type LupoState =
  | "welcome"   // saludando — onboarding intro
  | "celebrate" // cabriola — primer gasto, hitos
  | "empty"     // durmiendo — empty states
  | "thinking"  // orejas alzadas — loading IA largo
  | "warning"   // ceja levantada — error amistoso
  | "streak";   // con llamita — streak milestones

interface Props {
  state?: LupoState;
  size?: number;
  className?: string;
}

const FUR = "#2D6A4F";
const FUR_LIGHT = "#3F8C68";
const INNER_EAR = "#84CC16";
const SNOUT = "#FAFAF7";
const NOSE = "#1A1A1A";
const EYE = "#1A1A1A";
const EYE_HL = "#FAFAF7";
const FIRE_ORANGE = "#FF6B35";
const FIRE_YELLOW = "#FFB547";

export function Lupo({ state = "welcome", size = 120, className }: Props) {
  const reduceMotion = useReducedMotion();

  // Animaciones por estado: sutil, no agresivo. Respetan prefers-reduced-motion.
  const float = reduceMotion
    ? undefined
    : { y: [0, -3, 0], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" as const } };
  const wave = reduceMotion
    ? undefined
    : { rotate: [0, 18, 0, 18, 0], transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const, repeatDelay: 1.5 } };
  const bounce = reduceMotion
    ? undefined
    : { y: [0, -10, 0], transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" as const } };
  const breathe = reduceMotion
    ? undefined
    : { scale: [1, 1.04, 1], transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const } };
  const flame = reduceMotion
    ? undefined
    : { scaleY: [1, 1.18, 0.92, 1], transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" as const } };

  return (
    <motion.svg
      viewBox="0 0 140 140"
      width={size}
      height={size}
      className={className}
      animate={state === "celebrate" ? bounce : state === "empty" ? breathe : float}
      role="img"
      aria-label={`Lupo (${state})`}
    >
      {/* Sombra suave debajo */}
      <ellipse cx="70" cy="128" rx="34" ry="4" fill={FUR} opacity="0.12" />

      {/* Cuerpo */}
      <ellipse cx="70" cy="98" rx="34" ry="26" fill={FUR} />

      {/* Cabeza */}
      <circle cx="70" cy="60" r="32" fill={FUR} />

      {/* Orejas */}
      <polygon points="42,38 35,18 56,30" fill={FUR} />
      <polygon points="98,38 105,18 84,30" fill={FUR} />
      <polygon points="44,36 41,24 51,32" fill={INNER_EAR} />
      <polygon points="96,36 99,24 89,32" fill={INNER_EAR} />

      {/* Mejillas redondeadas claras */}
      <circle cx="55" cy="70" r="6" fill={FUR_LIGHT} opacity="0.7" />
      <circle cx="85" cy="70" r="6" fill={FUR_LIGHT} opacity="0.7" />

      {/* Hocico */}
      <ellipse cx="70" cy="70" rx="14" ry="11" fill={SNOUT} />
      <circle cx="70" cy="64" r="3.4" fill={NOSE} />
      {/* Linea de la boca, varia por estado */}
      {state === "warning" ? (
        // Boca recta preocupada
        <line x1="64" y1="76" x2="76" y2="76" stroke={NOSE} strokeWidth="2" strokeLinecap="round" />
      ) : state === "empty" ? (
        // Boca cerrada de dormir
        <path d="M 65 75 Q 70 76 75 75" stroke={NOSE} strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : (
        // Sonrisa simple
        <path d="M 64 74 Q 70 80 76 74" stroke={NOSE} strokeWidth="2" fill="none" strokeLinecap="round" />
      )}

      {/* Ojos: cambian segun el estado */}
      {state === "empty" ? (
        // Ojos cerrados (dos lineas)
        <>
          <path d="M 54 54 Q 58 58 62 54" stroke={EYE} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 78 54 Q 82 58 86 54" stroke={EYE} strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : state === "warning" ? (
        // Ojos con ceja levantada
        <>
          <line x1="50" y1="46" x2="62" y2="44" stroke={EYE} strokeWidth="2" strokeLinecap="round" />
          <line x1="78" y1="44" x2="90" y2="46" stroke={EYE} strokeWidth="2" strokeLinecap="round" />
          <circle cx="58" cy="54" r="3.5" fill={EYE} />
          <circle cx="82" cy="54" r="3.5" fill={EYE} />
          <circle cx="59.5" cy="52.5" r="1.2" fill={EYE_HL} />
          <circle cx="83.5" cy="52.5" r="1.2" fill={EYE_HL} />
        </>
      ) : (
        // Ojos normales redondos con highlight
        <>
          <circle cx="58" cy="54" r="4" fill={EYE} />
          <circle cx="82" cy="54" r="4" fill={EYE} />
          <circle cx="59.5" cy="52.5" r="1.4" fill={EYE_HL} />
          <circle cx="83.5" cy="52.5" r="1.4" fill={EYE_HL} />
        </>
      )}

      {/* Pata para saludar (solo state=welcome) */}
      {state === "welcome" && (
        <motion.g animate={wave} style={{ transformOrigin: "104px 88px" }}>
          <ellipse cx="111" cy="76" rx="8" ry="14" fill={FUR} transform="rotate(20 111 76)" />
          <circle cx="115" cy="68" r="5" fill={FUR_LIGHT} />
        </motion.g>
      )}

      {/* Brazos arriba (state=celebrate) */}
      {state === "celebrate" && (
        <>
          <ellipse cx="36" cy="70" rx="7" ry="12" fill={FUR} transform="rotate(-30 36 70)" />
          <ellipse cx="104" cy="70" rx="7" ry="12" fill={FUR} transform="rotate(30 104 70)" />
          <circle cx="32" cy="60" r="5" fill={FUR_LIGHT} />
          <circle cx="108" cy="60" r="5" fill={FUR_LIGHT} />
        </>
      )}

      {/* Llamita en la cola (state=streak) */}
      {state === "streak" && (
        <motion.g animate={flame} style={{ transformOrigin: "20px 100px" }}>
          <path
            d="M 20 90 Q 26 95 22 105 Q 18 100 14 105 Q 14 95 20 90 Z"
            fill={FIRE_ORANGE}
          />
          <path
            d="M 20 95 Q 23 99 21 104 Q 19 101 17 104 Q 17 98 20 95 Z"
            fill={FIRE_YELLOW}
          />
        </motion.g>
      )}

      {/* ZZZ (state=empty) */}
      {state === "empty" && (
        <g opacity="0.7">
          <text x="100" y="36" fontSize="14" fontWeight="bold" fill={FUR} fontFamily="system-ui">
            z
          </text>
          <text x="108" y="26" fontSize="11" fontWeight="bold" fill={FUR} fontFamily="system-ui">
            z
          </text>
          <text x="116" y="18" fontSize="9" fontWeight="bold" fill={FUR} fontFamily="system-ui">
            z
          </text>
        </g>
      )}

      {/* Bombilla pensando (state=thinking) */}
      {state === "thinking" && (
        <g>
          <circle cx="106" cy="22" r="9" fill={FIRE_YELLOW} />
          <rect x="103" y="29" width="6" height="3" fill={FUR} />
          <line x1="118" y1="22" x2="124" y2="22" stroke={FIRE_YELLOW} strokeWidth="2" strokeLinecap="round" />
          <line x1="113" y1="12" x2="116" y2="8" stroke={FIRE_YELLOW} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
    </motion.svg>
  );
}

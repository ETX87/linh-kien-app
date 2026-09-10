import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Persona } from "../types";
import { PERSONAS, DEFAULT_PERSONA_ID } from "../mock/personas";

interface PersonaCtx {
  persona: Persona;
  personaId: string;
  setPersonaId: (id: string) => void;
  manageParts: boolean;
  viewParts: boolean;
  toggleManageParts: () => void;
  toggleViewParts: () => void;
  all: Persona[];
}

const Ctx = createContext<PersonaCtx | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID);
  // 2 co doc lap bat them cho BAT KY persona (SPEC muc 2)
  const [overrideManage, setOverrideManage] = useState<boolean | null>(null);
  const [overrideView, setOverrideView] = useState<boolean | null>(null);

  const value = useMemo<PersonaCtx>(() => {
    const raw = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];
    const manageParts = overrideManage ?? raw.manageParts;
    const viewParts = overrideView ?? raw.viewParts;
    return {
      persona: { ...raw, manageParts, viewParts },
      personaId,
      setPersonaId: (id) => {
        setPersonaId(id);
        setOverrideManage(null);
        setOverrideView(null);
      },
      manageParts,
      viewParts,
      toggleManageParts: () => setOverrideManage((v) => !(v ?? raw.manageParts)),
      toggleViewParts: () => setOverrideView((v) => !(v ?? raw.viewParts)),
      all: PERSONAS,
    };
  }, [personaId, overrideManage, overrideView]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePersona() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePersona ngoài PersonaProvider");
  return c;
}

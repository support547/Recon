"use client";

import * as React from "react";

type HeaderActionsContextValue = {
  node: React.ReactNode;
  setNode: (n: React.ReactNode) => void;
};

const HeaderActionsContext = React.createContext<HeaderActionsContextValue | null>(
  null,
);

export function HeaderActionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<React.ReactNode>(null);
  const value = React.useMemo(() => ({ node, setNode }), [node]);
  return (
    <HeaderActionsContext.Provider value={value}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

export function useHeaderActionsSlot(): React.ReactNode {
  const ctx = React.useContext(HeaderActionsContext);
  return ctx?.node ?? null;
}

export function HeaderActions({ children }: { children: React.ReactNode }) {
  const ctx = React.useContext(HeaderActionsContext);
  React.useEffect(() => {
    if (!ctx) return;
    ctx.setNode(children);
    return () => ctx.setNode(null);
  }, [ctx, children]);
  return null;
}

"use client";

import Link, { useLinkStatus } from "next/link";
import * as React from "react";

import { decrement, increment } from "./nav-progress-store";

function PendingTracker() {
  const { pending } = useLinkStatus();
  React.useEffect(() => {
    if (!pending) return;
    increment();
    return () => {
      decrement();
    };
  }, [pending]);
  return null;
}

type LinkProps = React.ComponentProps<typeof Link>;

const ProgressLink = React.forwardRef<HTMLAnchorElement, LinkProps>(
  function ProgressLink({ children, ...rest }, ref) {
    return (
      <Link ref={ref} {...rest}>
        {children}
        <PendingTracker />
      </Link>
    );
  },
);

export default ProgressLink;

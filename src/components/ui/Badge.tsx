"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-violet-600/20 text-[#7c3aed] border border-violet-500/30",
        secondary: "bg-[#f3f2ee] text-[#44403c] border border-[#e8e7e2]",
        outline: "border border-[#dddcd7] text-[#57534e]",
        cluster: "text-white border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  clusterColor?: string;
}

function Badge({ className, variant, clusterColor, style, ...props }: BadgeProps) {
  const clusterStyle =
    variant === "cluster" && clusterColor
      ? {
          ...style,
          backgroundColor: `${clusterColor}20`,
          borderColor: `${clusterColor}50`,
          color: clusterColor,
        }
      : style;

  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      style={clusterStyle}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

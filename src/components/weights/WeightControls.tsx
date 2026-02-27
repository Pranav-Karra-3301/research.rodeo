"use client";

import { useCallback } from "react";
import { Sliders, Zap, Clock, Brain, Network, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { Slider } from "@/components/ui/Slider";
import { useGraphStore } from "@/store/graph-store";
import { cn } from "@/lib/utils";
import {
  WEIGHT_PRESETS,
  type WeightConfig,
  type WeightPreset,
} from "@/types";

const weightMeta: {
  key: keyof WeightConfig;
  label: string;
  icon: typeof Sliders;
  description: string;
}[] = [
  { key: "influence", label: "Influence", icon: Zap, description: "Citation impact" },
  { key: "recency", label: "Recency", icon: Clock, description: "How recent" },
  { key: "semanticSimilarity", label: "Semantic", icon: Brain, description: "Topic similarity" },
  { key: "localCentrality", label: "Centrality", icon: Network, description: "Graph position" },
  { key: "velocity", label: "Velocity", icon: TrendingUp, description: "Citation momentum" },
];

const presets: { key: WeightPreset; label: string }[] = [
  { key: "foundational", label: "Foundational" },
  { key: "balanced", label: "Balanced" },
  { key: "cutting-edge", label: "Cutting-edge" },
];

function getCurrentPreset(weights: WeightConfig): WeightPreset | null {
  for (const [key, preset] of Object.entries(WEIGHT_PRESETS)) {
    const match = (Object.keys(preset) as (keyof WeightConfig)[]).every(
      (k) => Math.abs(preset[k] - weights[k]) < 0.01
    );
    if (match) return key as WeightPreset;
  }
  return null;
}

export function WeightControls() {
  const weights = useGraphStore((s) => s.weights);
  const setWeights = useGraphStore((s) => s.setWeights);
  const recalculateScores = useGraphStore((s) => s.recalculateScores);

  const currentPreset = getCurrentPreset(weights);

  const handlePreset = useCallback(
    (preset: WeightPreset) => {
      setWeights(WEIGHT_PRESETS[preset]);
      recalculateScores();
    },
    [setWeights, recalculateScores]
  );

  const handleSlider = useCallback(
    (key: keyof WeightConfig, value: number[]) => {
      setWeights({ ...weights, [key]: value[0] });
      recalculateScores();
    },
    [weights, setWeights, recalculateScores]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      className="w-72 bg-white border border-[#e8e7e2] rounded-xl shadow-xl p-4 space-y-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-[#1c1917]">
        <Sliders className="w-4 h-4 text-[#7c3aed]" />
        Scoring Weights
      </div>

      {/* Presets */}
      <div className="flex gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors",
              currentPreset === p.key
                ? "bg-violet-600 text-white"
                : "bg-[#f3f2ee] text-[#44403c] hover:bg-[#eeeee8]"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Sliders */}
      <div className="space-y-3">
        {weightMeta.map((w) => (
          <div key={w.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <w.icon className="w-3 h-3 text-[#78716c]" />
                <span className="text-xs text-[#44403c]">{w.label}</span>
              </div>
              <span className="text-[10px] text-[#78716c] font-mono">
                {weights[w.key].toFixed(2)}
              </span>
            </div>
            <Slider
              value={[weights[w.key]]}
              onValueChange={(v) => handleSlider(w.key, v)}
              min={0}
              max={1}
              step={0.05}
            />
            <p className="text-[10px] text-[#a8a29e]">{w.description}</p>
          </div>
        ))}
      </div>

      {currentPreset && (
        <p className="text-[10px] text-[#78716c] text-center">
          Active preset: {currentPreset}
        </p>
      )}
    </motion.div>
  );
}

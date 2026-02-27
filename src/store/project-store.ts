import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  Project,
  PaperNode,
  GraphEdge,
  Cluster,
  WeightConfig,
  Annotation,
  ChatMessage,
} from "@/types";
import { DEFAULT_WEIGHTS } from "@/types";

interface ProjectState {
  currentProject: Project | null;
  projects: Project[];

  // Actions
  createProject: (name: string, rootQuery: string) => Project;
  loadProject: (projectId: string) => void;
  saveProject: (data: {
    nodes: PaperNode[];
    edges: GraphEdge[];
    clusters: Cluster[];
    weights: WeightConfig;
    annotations?: Annotation[];
    chatHistory?: ChatMessage[];
  }) => void;
  deleteProject: (projectId: string) => void;
  updateProjectName: (projectId: string, name: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      currentProject: null,
      projects: [],

      createProject: (name, rootQuery) => {
        const project: Project = {
          id: nanoid(),
          name,
          rootQuery,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          weights: DEFAULT_WEIGHTS,
          nodes: [],
          edges: [],
          clusters: [],
          annotations: [],
          chatHistory: [],
        };

        set((state) => ({
          projects: [...state.projects, project],
          currentProject: project,
        }));

        return project;
      },

      loadProject: (projectId) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (project) {
          set({ currentProject: project });
        }
      },

      saveProject: (data) =>
        set((state) => {
          if (!state.currentProject) return state;

          const updated: Project = {
            ...state.currentProject,
            nodes: data.nodes,
            edges: data.edges,
            clusters: data.clusters,
            weights: data.weights,
            annotations: data.annotations ?? state.currentProject.annotations,
            chatHistory:
              data.chatHistory ?? state.currentProject.chatHistory,
            updatedAt: Date.now(),
          };

          return {
            currentProject: updated,
            projects: state.projects.map((p) =>
              p.id === updated.id ? updated : p
            ),
          };
        }),

      deleteProject: (projectId) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== projectId),
          currentProject:
            state.currentProject?.id === projectId
              ? null
              : state.currentProject,
        })),

      updateProjectName: (projectId, name) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, name, updatedAt: Date.now() } : p
          ),
          currentProject:
            state.currentProject?.id === projectId
              ? { ...state.currentProject, name, updatedAt: Date.now() }
              : state.currentProject,
        })),
    }),
    {
      name: "research-rodeo-projects",
      // Only persist the projects list, not currentProject (loaded on demand)
      partialize: (state) => ({
        projects: state.projects,
      }),
    }
  )
);

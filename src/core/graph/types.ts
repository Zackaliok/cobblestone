export interface GraphNode {
  /** `${workspaceId}::${slug}` */
  id: string;
  label: string;
  workspaceId: string;
  slug: string;
  /** Chemin du fichier, absent si le nœud correspond à un lien cassé. */
  path?: string;
  /** `true` quand aucune note ne correspond : le lien pointe dans le vide. */
  missing: boolean;
  /** Nombre de liens entrants + sortants — sert à dimensionner le nœud. */
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** `true` si le lien traverse une frontière de workspace. */
  crossWorkspace: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

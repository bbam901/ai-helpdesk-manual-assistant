export interface ManualMetadata {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  author: string;
  last_updated: string;
}

export interface Manual {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  author: string;
  lastUpdated: string;
  content: string;
  filePath: string;
}

export interface SearchResult {
  manual: Manual;
  score: number;
  matchedKeywords: string[];
  expectedCauses: string[];
  suggestedSteps: string[];
  additionalChecks: string[];
  matchedSnippets: string[];
  relevance?: number;
  classifiedCategory?: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: "낮음" | "보통" | "높음" | "긴급";
  referencedManual: string;
  requesterName: string;
  requesterDept: string;
  createdAt: string;
  status: "open" | "processing" | "resolved";
  resolutionComment?: string;
  resolvedAt?: string;
  resolverName?: string;
  aiSuggestedSteps?: string[];
}


export interface MultiSelectOption {
  id: number;
  name: string;
}

export type DatePreset = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'thismonth' | 'custom';

export interface FilterState {
  pipelineId: number | null;
  managerIds: number[];
  tagIds: number[];
  sourceIds: number[];
  status: string;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
}

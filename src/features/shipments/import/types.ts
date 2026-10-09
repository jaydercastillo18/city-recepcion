export interface ImportItem {
  supplier: string;
  code_original: string;
  product_name: string;
  expected_boxes: number;
}

export interface ImportWarning {
  code: string;
  message: string;
  count: number;
  rows: number[];
}

export interface PreviewRow extends ImportItem {
  sourceRows: number[];
  validation: 'ready' | 'warning' | 'omitted' | 'error';
  messages: string[];
}

export interface ImportPreview {
  fileName: string;
  fileHash: string;
  fingerprint: string;
  sheetName: string;
  sheets: { name: string; importable: boolean }[];
  headerRow: number;
  columns: { field: string; header: string }[];
  detectedDate: string | null;
  detectedDestination: string | null;
  rowsDetected: number;
  productCount: number;
  totalBoxes: number;
  warnings: ImportWarning[];
  errors: string[];
  rows: PreviewRow[];
  items: ImportItem[];
}

export interface ImportResult {
  shipment_id: string;
  shipment_number: string;
  item_count: number;
  total_boxes: number;
  reused: boolean;
}

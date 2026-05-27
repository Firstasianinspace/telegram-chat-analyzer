import type { ColumnDef } from '@tanstack/vue-table';
import type { ChatMessage } from '@/modules/chat/domain/entities/types';
import { i18n } from '@/core/config/i18n';
import {
  dateRangeFilter,
  typesFilter,
  textSearchFilter,
} from './tableFilters';

function t(key: string): string {
  return i18n.global.t(key);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-En', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function truncate(text: string | undefined, maxLength: number): string {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, Math.max(0, maxLength)) + '...' : text;
}

export const commonColumns: ColumnDef<ChatMessage, unknown>[] = [
  {
    accessorKey: 'id',
    header: () => t('table.columnId'),
    size: 80,
    enableSorting: true,
    enableColumnFilter: false,
  },
  {
    accessorKey: 'timestamp',
    header: () => t('table.columnDate'),
    size: 180,
    enableSorting: true,
    enableColumnFilter: true,
    filterFn: dateRangeFilter,
    cell: info => formatDate(info.getValue() as Date),
  },
  {
    accessorKey: 'from',
    header: () => t('table.columnFrom'),
    size: 150,
    enableSorting: true,
    enableColumnFilter: false,
  },
];

export const textMessageColumns: ColumnDef<ChatMessage, unknown>[] = [
  ...commonColumns,
  {
    accessorKey: 'text',
    header: () => t('table.columnText'),
    size: 400,
    enableSorting: false,
    enableColumnFilter: true,
    filterFn: textSearchFilter,
    cell: info => truncate(info.getValue() as string, 100),
  },
  {
    id: 'length',
    header: () => t('table.columnLength'),
    size: 80,
    enableSorting: true,
    enableColumnFilter: false,
    accessorFn: row => row.text?.length || 0,
  },
];

export const stickerMessageColumns: ColumnDef<ChatMessage, unknown>[] = [
  ...commonColumns,
  {
    accessorKey: 'file.stickerEmoji',
    header: () => t('table.columnEmoji'),
    size: 80,
  },
  {
    accessorKey: 'text',
    header: () => t('table.columnCaption'),
    size: 200,
    cell: info => truncate(info.getValue() as string, 50),
  },
];

export const mediaMessageColumns: ColumnDef<ChatMessage, unknown>[] = [
  ...commonColumns,
  {
    accessorKey: 'file.name',
    header: () => t('table.columnFileName'),
    size: 200,
    cell: info => truncate(info.getValue() as string, 30),
  },
  {
    accessorKey: 'file.mimeType',
    header: () => t('table.columnType'),
    size: 150,
  },
  {
    accessorKey: 'file.size',
    header: () => t('table.columnSize'),
    size: 100,
    cell: info => {
      const size = info.getValue() as number | undefined;
      if (!size) return '-';
      return `${(size / 1024).toFixed(1)} KB`;
    },
  },
  {
    accessorKey: 'file.duration',
    header: () => t('table.columnDuration'),
    size: 100,
    cell: info => {
      const duration = info.getValue() as number | undefined;
      if (!duration) return '-';
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },
  },
  {
    accessorKey: 'file.width',
    header: () => t('table.columnWidth'),
    size: 80,
    cell: info => {
      const width = info.getValue() as number | undefined;
      return width ? `${width}px` : '-';
    },
  },
  {
    accessorKey: 'file.height',
    header: () => t('table.columnHeight'),
    size: 80,
    cell: info => {
      const height = info.getValue() as number | undefined;
      return height ? `${height}px` : '-';
    },
  },
];

export const serviceMessageColumns: ColumnDef<ChatMessage, unknown>[] = [
  ...commonColumns,
  {
    accessorKey: 'serviceAction',
    header: () => t('table.columnAction'),
    size: 150,
  },
  {
    accessorKey: 'serviceActor',
    header: () => t('table.columnActor'),
    size: 150,
  },
  {
    accessorKey: 'discardReason',
    header: () => t('table.columnDiscardReason'),
    size: 150,
  },
];

export const allMessageColumns: ColumnDef<ChatMessage, unknown>[] = [
  ...commonColumns,
  {
    accessorKey: 'type',
    header: () => t('table.columnType'),
    size: 100,
    enableSorting: true,
    enableColumnFilter: true,
    filterFn: typesFilter,
  },
  {
    accessorKey: 'text',
    header: () => t('table.columnTextCaption'),
    size: 150,
    enableColumnFilter: true,
    filterFn: textSearchFilter,
    cell: info => truncate(info.getValue() as string, 100),
  },

  {
    accessorKey: 'file.stickerEmoji',
    header: () => t('table.columnEmoji'),
    size: 70,
    cell: info => info.getValue() || '-',
  },


  {
    accessorKey: 'file.duration',
    header: () => t('table.columnDuration'),
    size: 90,
    cell: info => {
      const duration = info.getValue() as number | undefined;
      if (!duration) return '-';
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },
  },
  {
    id: 'dimensions',
    header: () => t('table.columnDimensions'),
    size: 110,
    accessorFn: row => {
      const width = row.file?.width;
      const height = row.file?.height;
      if (width && height) {
        return `${width}×${height}`;
      }
      return;
    },
    cell: info => info.getValue() || '-',
  },
];

export function getColumnsForType(type: 'text' | 'sticker' | 'media' | 'service' | 'all'): ColumnDef<ChatMessage, unknown>[] {
  switch (type) {
    case 'service': {
      return serviceMessageColumns;
    }
    default: {
      return allMessageColumns;
    }
  }
}

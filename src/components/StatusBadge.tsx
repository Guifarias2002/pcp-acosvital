import { COR_STATUS, STATUS_LABELS } from '@/lib/types';

export default function StatusBadge({ status, cor }: { status: string; cor?: string }) {
  const cls = cor ? COR_STATUS[cor] : COR_STATUS['secondary'];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

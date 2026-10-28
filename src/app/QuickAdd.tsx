import { useNavigate } from 'react-router-dom';
import { Bell, FileText, NotePad, Plus, Receipt, Wrench } from '../ui/Icons';
import { Menu } from '../ui/menu';

/**
 * One menu for adding anything. Each choice opens the same form its area uses, through the ?new=
 * links those pages already understand, so there's a single way to create each kind of thing.
 */
export function QuickAdd({ variant = 'sidebar' }: { variant?: 'sidebar' | 'header' }) {
  const navigate = useNavigate();
  return (
    <Menu
      label="Add to Homebase"
      align={variant === 'sidebar' ? 'start' : 'end'}
      triggerClassName={variant === 'sidebar' ? 'button is-primary quick-add' : 'round-button quick-add-round'}
      trigger={
        <>
          <Plus size={variant === 'sidebar' ? 18 : 20} />
          {variant === 'sidebar' && <span>Add</span>}
        </>
      }
      items={[
        { id: 'task', label: 'Task or repair', hint: 'A one-off job with a due date', icon: Wrench, onSelect: () => navigate('/tasks?new=1&kind=repair') },
        { id: 'reminder', label: 'Maintenance reminder', hint: 'Repeats on a schedule', icon: Bell, onSelect: () => navigate('/tasks?new=1&kind=maintenance') },
        { id: 'record', label: 'Record', hint: 'Warranty, manual or document', icon: FileText, onSelect: () => navigate('/records?new=warranty') },
        { id: 'receipt', label: 'Receipt', hint: 'With a photo or PDF', icon: Receipt, onSelect: () => navigate('/records?new=receipt') },
        { id: 'note', label: 'Household note', hint: 'Codes, contacts, where things are', icon: NotePad, onSelect: () => navigate('/records?new=note') },
      ]}
    />
  );
}

import { Notice } from '../../../ui/layout';

export function KeyFlagNotices({ flags }: { flags: { dnd?: boolean; restricted?: boolean; transponder?: boolean } }) {
  if (!flags.dnd && !flags.restricted && !flags.transponder) return null;
  return (
    <div className="section stack-16">
      {flags.dnd && (
        <Notice>
          <b>Stamped “Do not duplicate.”</b> Many hardware stores and kiosks won’t copy it. Ask the lock’s owner or a locksmith.
        </Notice>
      )}
      {flags.restricted && (
        <Notice>
          <b>Restricted keyway.</b> Blanks are sold only to authorized dealers. You’ll usually need the key’s ID card or the owner’s authorization.
        </Notice>
      )}
      {flags.transponder && (
        <Notice>
          <b>Possible chip or fob key.</b> A chip can’t be seen in a photo. If this key has one, a working copy needs cutting and programming to the vehicle.
        </Notice>
      )}
    </div>
  );
}

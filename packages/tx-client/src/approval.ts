import { buildDisclosure } from './disclosure.js';
import { shortenAddress } from './format.js';
import type { TransactionIntent } from './types.js';

/**
 * Default approval UI. It renders the required disclosure and resolves `true`
 * only when the end user clicks "Approve". Rejecting resolves `false`; the
 * caller then records USER_CANCELLED and never touches the wallet.
 */
export function createDomApproval(): (intent: TransactionIntent) => Promise<boolean> {
  return (intent) =>
    new Promise<boolean>((resolve) => {
      if (typeof document === 'undefined') {
        throw new Error(
          'No DOM available for the approval dialog. Provide requestApproval to run headless.'
        );
      }

      const previouslyFocused = document.activeElement as HTMLElement | null;
      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Confirm transaction');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483647',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'background:rgba(8,10,18,0.72)',
        'font-family:system-ui,-apple-system,Segoe UI,sans-serif'
      ].join(';');

      const card = document.createElement('div');
      card.style.cssText = [
        'width:min(460px,92vw)',
        'max-height:88vh',
        'overflow:auto',
        'background:#12141c',
        'color:#f5f7ff',
        'border:1px solid #2b2f3d',
        'border-radius:14px',
        'padding:20px',
        'box-shadow:0 24px 60px rgba(0,0,0,0.5)'
      ].join(';');

      const title = document.createElement('h2');
      title.textContent = 'Confirm transaction';
      title.style.cssText = 'margin:0 0 4px;font-size:18px';

      const subtitle = document.createElement('p');
      subtitle.textContent = 'Review exactly what you are about to sign.';
      subtitle.style.cssText = 'margin:0 0 16px;color:#9aa3b8;font-size:13px';

      const list = document.createElement('ul');
      list.style.cssText = 'list-style:none;margin:0 0 16px;padding:0;font-size:14px;line-height:1.6';
      for (const line of intent.disclosure) {
        const item = document.createElement('li');
        item.textContent = line;
        item.style.cssText = 'padding:6px 0;border-bottom:1px solid #222634';
        list.appendChild(item);
      }

      const effects = document.createElement('div');
      effects.style.cssText =
        'background:#1b1408;border:1px solid #4a3a12;border-radius:10px;padding:10px 12px;margin-bottom:16px;font-size:13px;color:#ffd88a';
      for (const effect of intent.assetEffects) {
        const line = document.createElement('div');
        line.textContent = `⚠ ${effect}`;
        effects.appendChild(line);
      }

      const hashLine = document.createElement('p');
      hashLine.textContent = `Calldata hash: ${shortenAddress(intent.calldataHash, 10, 8)}`;
      hashLine.style.cssText = 'margin:0 0 16px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#7f8aa3';

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';

      const reject = document.createElement('button');
      reject.type = 'button';
      reject.textContent = 'Reject';
      reject.style.cssText =
        'padding:10px 16px;border-radius:9px;border:1px solid #3a3f52;background:transparent;color:#d6dbe8;cursor:pointer;font-size:14px';

      const approve = document.createElement('button');
      approve.type = 'button';
      approve.textContent = 'Approve transaction';
      approve.style.cssText =
        'padding:10px 16px;border-radius:9px;border:0;background:#4f7cff;color:#fff;cursor:pointer;font-size:14px;font-weight:600';

      actions.append(reject, approve);
      card.append(title, subtitle, list, effects, hashLine, actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      approve.focus();

      const cleanup = (): void => {
        overlay.remove();
        previouslyFocused?.focus?.();
      };

      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          finish(false);
        }
      };

      const finish = (approved: boolean): void => {
        document.removeEventListener('keydown', onKeyDown);
        cleanup();
        resolve(approved);
      };

      reject.addEventListener('click', () => finish(false));
      approve.addEventListener('click', () => finish(true));
      document.addEventListener('keydown', onKeyDown);
    });
}

export function buildIntentDisclosure(): typeof buildDisclosure {
  return buildDisclosure;
}

/**
 * {Language} security signal detection.
 *
 * To add a new signal detector:
 * 1. Copy this file to `src/security/signals/{language}-signals.ts`
 * 2. Implement the `detect()` method with regex/string checks
 * 3. Add test fixtures to `tests/security/fixtures/`
 * 4. Write tests in `tests/security/signals/{language}-signals.test.ts`
 * 5. The detector auto-registers via `language` field
 */
import type { SecuritySignal, ISignalDetector } from '../../types.js';
import { createSignal } from '../../types.js';

export class TemplateSignals implements ISignalDetector {
  language = 'template';

  detect(filePath: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];
    // TODO: Add detection rules
    // Example:
    // if (/unsafe_pattern/.test(content)) {
    //   signals.push(createSignal(filePath, this.language, 'unsafe-deserialization',
    //     'pattern-name', 'Description', 'high', content.substring(0, 200)));
    // }
    return signals;
  }
}

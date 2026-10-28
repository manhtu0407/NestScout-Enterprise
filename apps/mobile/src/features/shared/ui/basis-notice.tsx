import { isFixtureBasis } from '../fixture-basis';

import { BodyText } from './text';

export function BasisNotice({ basis, noun }: { basis: string; noun: 'quote' | 'offer' }) {
  return (
    <BodyText muted>
      {isFixtureBasis(basis)
        ? `Test ${noun} — not a real price or commitment.`
        : `This ${noun} has an unrecognized source and cannot be accepted here.`}
    </BodyText>
  );
}

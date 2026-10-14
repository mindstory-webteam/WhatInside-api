import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { DevCodeNotice, OtpField, PhoneField } from '@/features/auth/AuthFields';

function OtpHarness({ onDone }: { onDone: (c: string) => void }) {
  const [v, setV] = useState('');
  return <OtpField value={v} onChange={(c) => { setV(c); if (c.length === 6) onDone(c); }} testID="otp" />;
}

describe('auth fields', () => {
  it('OTP field keeps digits only and stops at 6 (paste / SMS autofill)', async () => {
    const onDone = jest.fn();
    await render(<OtpHarness onDone={onDone} />);
    await fireEvent.changeText(screen.getByTestId('otp'), '12a 34-5678');
    expect(onDone).toHaveBeenCalledWith('123456');
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('phone field strips +91 and formats as 98765 43210', async () => {
    const onChange = jest.fn();
    await render(<PhoneField label="Mobile number" value="9876543210" onChange={onChange} testID="phone" />);
    expect(screen.getByDisplayValue('98765 43210')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('phone'), '+91 91234 56789');
    expect(onChange).toHaveBeenCalledWith('9123456789');
  });

  it('test-mode code notice fills the code', async () => {
    const onUse = jest.fn();
    await render(<DevCodeNotice code="482913" label="Test mode — your code is" useLabel="Use code" onUse={onUse} />);
    await fireEvent.press(screen.getByText('Use code'));
    expect(onUse).toHaveBeenCalledWith('482913');
  });
});

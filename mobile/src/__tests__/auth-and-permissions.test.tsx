import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { ApiError } from '@/api/client';
import type { Household, User } from '@/api/types';
import { authReducer, initialAuthState } from '@/auth/AuthContext';
import { LoginForm } from '@/features/auth/LoginForm';
import { cameraPermissionUi, guideCrop } from '@/features/scan/permission';
import { PermissionGate } from '@/features/scan/PermissionGate';

const user = { id: 1, phone: '+919876543210', email: null, name: 'Anu' } as User;
const home = { id: 5, name: 'Home' } as Household;
const flat = { id: 6, name: 'Flat' } as Household;

describe('auth state machine (navigation guard)', () => {
  it('routes users without a household to setup', async () => {
    const s = authReducer(initialAuthState, { type: 'loaded', user, households: [], selectedId: null });
    expect(s.status).toBe('needsHousehold');
  });

  it('selects the saved household, falling back to the first', async () => {
    expect(authReducer(initialAuthState, { type: 'loaded', user, households: [home, flat], selectedId: 6 }).household).toBe(flat);
    expect(authReducer(initialAuthState, { type: 'loaded', user, households: [home, flat], selectedId: 99 }).household).toBe(home);
  });

  it('marks expired sessions and clears data', async () => {
    const ready = authReducer(initialAuthState, { type: 'loaded', user, households: [home], selectedId: 5 });
    const out = authReducer(ready, { type: 'signedOut', expired: true });
    expect(out).toMatchObject({ status: 'signedOut', user: null, household: null, sessionExpired: true });
  });

  it('ignores switching to a household the user is not in', async () => {
    const ready = authReducer(initialAuthState, { type: 'loaded', user, households: [home], selectedId: 5 });
    expect(authReducer(ready, { type: 'select', id: 42 }).household).toBe(home);
  });
});

describe('LoginForm (mobile number)', () => {
  it('validates before submitting', async () => {
    const onSubmit = jest.fn();
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Enter your mobile number')).toBeTruthy();
    expect(screen.getByText('This field is required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects numbers that are not 10-digit Indian mobiles', async () => {
    const onSubmit = jest.fn();
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('login-phone'), '12345');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret-pass');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Enter a valid 10-digit mobile number')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the 10 digits (formatted as typed) and shows API errors', async () => {
    const onSubmit = jest.fn().mockRejectedValueOnce(new ApiError('auth', 'No active account', 401));
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('login-phone'), '+91 98765-43210');
    expect(screen.getByDisplayValue('98765 43210')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret-pass');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('9876543210', 'secret-pass'));
    expect(await screen.findByText('Mobile number or password is incorrect.')).toBeTruthy();
  });

  it('lets older accounts sign in with email', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByTestId('login-mode'));
    await fireEvent.changeText(screen.getByTestId('login-email'), 'anu@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret-pass');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('anu@example.com', 'secret-pass'));
  });

  it('shows offline errors clearly', async () => {
    const onSubmit = jest.fn().mockRejectedValueOnce(new ApiError('network', 'You appear to be offline.'));
    await render(<LoginForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('login-phone'), '9876543210');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'x');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('You appear to be offline.')).toBeTruthy();
  });
});

describe('camera permission handling', () => {
  it('derives UI state', async () => {
    expect(cameraPermissionUi(null)).toBe('loading');
    expect(cameraPermissionUi({ granted: true, canAskAgain: true })).toBe('granted');
    expect(cameraPermissionUi({ granted: false, canAskAgain: true })).toBe('ask');
    expect(cameraPermissionUi({ granted: false, canAskAgain: false })).toBe('blocked');
  });

  it('offers a request button when it can still ask', async () => {
    const onRequest = jest.fn();
    await render(<PermissionGate state="ask" onRequest={onRequest} onManual={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('allow-camera'));
    expect(onRequest).toHaveBeenCalled();
  });

  it('when blocked, links to Settings and offers manual entry', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const onManual = jest.fn();
    await render(<PermissionGate state="blocked" onRequest={jest.fn()} onManual={onManual} onUpload={jest.fn()} />);
    expect(screen.getByText(/Camera access is turned off/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Open Settings'));
    expect(openSettings).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('manual-fallback'));
    expect(onManual).toHaveBeenCalled();
  });

  it('computes a centred crop for the label guide', async () => {
    expect(guideCrop(1000, 2000)).toEqual({ originX: 70, originY: 500, width: 860, height: 1000 });
  });
});

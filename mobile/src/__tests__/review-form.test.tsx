import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ReviewForm } from '@/features/review/ReviewForm';
import { draftFromOcr, emptyDraft, toConfirmPayload } from '@/scan/draft';
import type { ProductForm } from '@/validation/schemas';

import { ocrFixture } from '@/test-utils/fixtures';

describe('OCR review screen', () => {
  it('shows warnings, detected dates and highlights uncertain fields', async () => {
    await render(<ReviewForm draft={draftFromOcr(ocrFixture(), '2026-10-12')} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText(/day\/month or month\/day/)).toBeTruthy();
    expect(screen.getByTestId('date-candidates')).toBeTruthy();
    expect(screen.getAllByText('Check').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Curd')).toBeTruthy();
  });

  it('lets the user correct an ambiguous date and saves the corrected value', async () => {
    const onSubmit = jest.fn();
    await render(<ReviewForm draft={draftFromOcr(ocrFixture(), '2026-10-12')} onSubmit={onSubmit} onCancel={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('use-expiry_date-2026-11-06'));
    await fireEvent.changeText(screen.getByTestId('field-name'), 'Plain Curd');
    await fireEvent.press(screen.getByTestId('storage-freezer'));
    await fireEvent.press(screen.getByTestId('review-save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const values: ProductForm = onSubmit.mock.calls[0][0];
    expect(values).toMatchObject({ name: 'Plain Curd', expiry_date: '2026-11-06', storage_location: 'freezer' });
    expect(toConfirmPayload(values, 'ocr').expiry_confirmed).toBe(true);
  });

  it('blocks saving without an expiry decision, then allows "not sure"', async () => {
    const onSubmit = jest.fn();
    const draft = emptyDraft('2026-10-12');
    await render(<ReviewForm draft={draft} onSubmit={onSubmit} onCancel={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('field-name'), 'Rice');
    await fireEvent.press(screen.getByTestId('review-save'));
    expect((await screen.findAllByText(/Enter the expiry date/)).length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('expiry-unsure'));
    await fireEvent.press(screen.getByTestId('review-save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(toConfirmPayload(onSubmit.mock.calls[0][0], 'manual').expiry_confirmed).toBe(false);
  });

  it('validates quantity', async () => {
    const onSubmit = jest.fn();
    await render(<ReviewForm draft={draftFromOcr(ocrFixture(), '2026-10-12')} onSubmit={onSubmit} onCancel={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('field-quantity'), '0');
    await fireEvent.press(screen.getByTestId('review-save'));
    expect(await screen.findByText('Must be greater than zero')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows server field errors', async () => {
    await render(<ReviewForm draft={emptyDraft('2026-10-12')} onSubmit={jest.fn()} onCancel={jest.fn()}
                       serverError="Product already exists" serverFieldErrors={{ name: 'This product already exists in your household.' }} />);
    expect(screen.getByText('Product already exists')).toBeTruthy();
    expect(screen.getByText('This product already exists in your household.')).toBeTruthy();
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';

import { DateField } from '@/components/DateField';
import { ReviewForm } from '@/features/review/ReviewForm';
import { addMonths, endOfMonth, monthGrid, parseTypedDate, shiftMonth } from '@/lib/calendar';
import { emptyDraft } from '@/scan/draft';

describe('calendar helpers', () => {
  it('builds a Monday-first month grid', () => {
    const g = monthGrid(2027, 4); // 1 Apr 2027 is a Thursday
    expect(g.slice(0, 4)).toEqual([null, null, null, '2027-04-01']);
    expect(g.filter(Boolean)).toHaveLength(30);
    expect(g).toHaveLength(42);
  });

  it('moves between months and years', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
    expect(shiftMonth(2026, 10, 12)).toEqual({ y: 2027, m: 10 });
  });

  it('handles month ends and leap years', () => {
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });

  it('parses typed dates in the user format', () => {
    expect(parseTypedDate('30/04/2027')).toBe('2027-04-30');
    expect(parseTypedDate('30-4-27')).toBe('2027-04-30');
    expect(parseTypedDate('30 Apr 2027')).toBe('2027-04-30');
    expect(parseTypedDate('04/30/2027', 'MM/DD/YYYY')).toBe('2027-04-30');
    expect(parseTypedDate('2027-04-30', 'YYYY-MM-DD')).toBe('2027-04-30');
    expect(parseTypedDate('31/04/2027')).toBeNull();
    expect(parseTypedDate('hello')).toBeNull();
  });
});

describe('DateField calendar sheet', () => {
  it('lets the user pick a day and confirm', async () => {
    const onChange = jest.fn();
    await render(<DateField label="Expiry / use-by date" value="2027-04-10" onChange={onChange} testID="exp" />);
    await fireEvent.press(screen.getByTestId('exp'));
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('April 2027');
    await fireEvent.press(screen.getByTestId('day-2027-04-30'));
    await fireEvent.press(screen.getByTestId('calendar-done'));
    expect(onChange).toHaveBeenCalledWith('2027-04-30');
  });

  it('navigates months and accepts a typed date', async () => {
    const onChange = jest.fn();
    await render(<DateField label="Expiry" value="2027-04-10" onChange={onChange} testID="exp" />);
    await fireEvent.press(screen.getByTestId('exp'));
    await fireEvent.press(screen.getByTestId('calendar-next'));
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('May 2027');
    await fireEvent.changeText(screen.getByTestId('calendar-typed'), '15/08/2027');
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('August 2027');
    await fireEvent.press(screen.getByTestId('calendar-done'));
    expect(onChange).toHaveBeenCalledWith('2027-08-15');
  });

  it('blocks days after the maximum (e.g. future manufacturing dates)', async () => {
    const onChange = jest.fn();
    await render(<DateField label="Mfg" value="2026-10-01" onChange={onChange} testID="mfg"
                            maximumDate={new Date(2026, 9, 13)} />);
    await fireEvent.press(screen.getByTestId('mfg'));
    await fireEvent.press(screen.getByTestId('day-2026-10-20'));
    await fireEvent.press(screen.getByTestId('calendar-done'));
    expect(onChange).toHaveBeenCalledWith('2026-10-01'); // unchanged selection
  });
});

describe('Save button explains what is blocking it', () => {
  it('lists missing fields next to Save', async () => {
    await render(<ReviewForm draft={emptyDraft('2026-10-13')} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('review-save'));
    const box = await screen.findByTestId('save-blockers');
    expect(box).toHaveTextContent(/Product name/);
    expect(box).toHaveTextContent(/Expiry \/ use-by date/);
  });

  it('shows server errors next to Save', async () => {
    await render(<ReviewForm draft={emptyDraft('2026-10-13')} onSubmit={jest.fn()} onCancel={jest.fn()}
                             serverError="Saving new products needs a connection." />);
    expect(screen.getByTestId('save-blockers')).toHaveTextContent(/needs a connection/);
  });
});

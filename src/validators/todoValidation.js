import * as yup from 'yup';
import { parseISO, isValid } from 'date-fns';
import zhCN from '../locales/zh-CN';

const {
  todo: { validation }
} = zhCN;

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;

export const todoSchema = yup
  .object()
  .shape({
    content: yup
      .string()
      .trim()
      .required(validation.contentRequired),
    due_date: yup
      .string()
      .nullable()
      .transform((value) => (value === '' ? null : value))
      .test('valid-date', validation.dateInvalid, (value) => {
        if (!value) return true;
        if (!dateRegex.test(value)) return false;
        try {
          const date = parseISO(value);
          return isValid(date);
        } catch (err) {
          return false;
        }
      }),
    due_time: yup
      .string()
      .nullable()
      .transform((value) => (value === '' ? null : value))
      .test('valid-time', validation.timeInvalid, (value) => {
        if (!value) return true;
        return timeRegex.test(value);
      })
      .test('time-with-date', validation.timeWithoutDate, function (value) {
        if (!value) return true;
        const { due_date } = this.parent;
        return Boolean(due_date);
      }),
    repeat_type: yup.string().default('none'),
    repeat_interval: yup.number().nullable(),
    repeat_days: yup.string().nullable(),
    is_important: yup.boolean().default(false),
    is_urgent: yup.boolean().default(false),
    tags: yup.string().nullable()
  })
  .test('repeat-requires-date', validation.dateRequiredForRepeat, (value) => {
    if (!value) return true;
    const { repeat_type, due_date } = value;
    if (repeat_type && repeat_type !== 'none') {
      return Boolean(due_date);
    }
    return true;
  });

export const extractValidationErrors = (validationError) => {
  if (!validationError?.inner?.length) {
    return validationError?.path
      ? { [validationError.path]: validationError.message }
      : { form: validationError?.message };
  }

  return validationError.inner.reduce((acc, error) => {
    if (!error.path) {
      return acc;
    }
    if (!acc[error.path]) {
      acc[error.path] = error.message;
    }
    return acc;
  }, {});
};

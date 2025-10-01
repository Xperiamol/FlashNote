import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import TodoFormFields from './TodoFormFields';
import TimeZoneUtils from '../utils/timeZoneUtils';
import { updateTodo, getTodoTagSuggestions } from '../api/todoAPI';
import zhCN from '../locales/zh-CN';
import { todoSchema, extractValidationErrors } from '../validators/todoValidation';

const mapTodoToForm = (todo) => {
  if (!todo) {
    return {
      content: '',
      tags: '',
      is_important: false,
      is_urgent: false,
      due_date: '',
      due_time: '',
      repeat_type: 'none',
      repeat_interval: 1,
      repeat_days: ''
    };
  }

  const { date: localDate, time: localTime } = TimeZoneUtils.fromUTC(todo.due_date);

  return {
    content: todo.content || '',
    tags: todo.tags || '',
    is_important: Boolean(todo.is_important),
    is_urgent: Boolean(todo.is_urgent),
    due_date: localDate,
    due_time: localTime,
    repeat_type: todo.repeat_type || 'none',
    repeat_interval: todo.repeat_interval || 1,
    repeat_days: todo.repeat_days || ''
  };
};

const TodoEditDialog = ({ todo, open, onClose, onUpdated }) => {
  const [formData, setFormData] = useState(mapTodoToForm(todo));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const {
    todo: { dialog }
  } = zhCN;

  useEffect(() => {
    setFormData(mapTodoToForm(todo));
    setErrors({});
  }, [todo]);

  if (!todo) {
    return null;
  }

  const buildUpdatePayload = () => {
    const { due_date, due_time, ...rest } = formData;
    return {
      ...rest,
      due_date: due_date ? TimeZoneUtils.toUTC(due_date, due_time) : null
    };
  };

  const handleSubmit = async () => {
    try {
      const validated = await todoSchema.validate(formData, { abortEarly: false });
      setErrors({});
      setSaving(true);
      const payload = buildUpdatePayload();
      const updated = await updateTodo(todo.id, payload);

      if (onUpdated) {
        onUpdated(updated || { ...todo, ...payload });
      }
      if (onClose) {
        onClose();
      }
    } catch (error) {
      if (error.name === 'ValidationError') {
        setErrors(extractValidationErrors(error));
      } else {
        console.error('更新待办事项失败:', error);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (nextValue, meta) => {
    setFormData(nextValue);

    if (meta?.fields?.length) {
      setErrors((prev) => {
        const nextErrors = { ...prev };
        meta.fields.forEach((field) => {
          if (field) {
            delete nextErrors[field];
          }
        });
        return nextErrors;
      });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{dialog.editTitle}</DialogTitle>
      <DialogContent>
        <TodoFormFields
          value={formData}
          onChange={handleFieldChange}
          mode="edit"
          errors={errors}
          getTagSuggestions={getTodoTagSuggestions}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{dialog.cancel}</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={saving}>
          {saving ? dialog.saving : dialog.save}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TodoEditDialog;

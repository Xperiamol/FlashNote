import React from 'react';
import { Box, TextField, FormControlLabel, Checkbox, FormHelperText } from '@mui/material';
import TagInput from './TagInput';
import RepeatSettings from './RepeatSettings';
import DateTimePicker from './DateTimePicker';
import TimeZoneUtils from '../utils/timeZoneUtils';
import zhCN from '../locales/zh-CN';

const {
  todo: { fields }
} = zhCN;

const TodoFormFields = ({
  value,
  onChange,
  mode = 'create',
  errors = {},
  getTagSuggestions
}) => {
  const emitChange = (nextValue, changedFields) => {
    if (typeof onChange === 'function') {
      onChange(nextValue, { fields: changedFields });
    }
  };

  const handleFieldChange = (field, next) => {
    const nextValue = { ...value, [field]: next };

    if (field === 'due_date' && !next) {
      nextValue.due_time = '';
    }

    emitChange(nextValue, [field, field === 'due_date' ? 'due_time' : undefined].filter(Boolean));
  };

  const handleCheckboxChange = (field) => (event) => {
    const nextValue = { ...value, [field]: event.target.checked };
    emitChange(nextValue, [field]);
  };

  const handleTagChange = (tags) => {
    const nextValue = { ...value, tags };
    emitChange(nextValue, ['tags']);
  };

  const handleRepeatSettingsChange = (repeatSettings) => {
    const nextValue = { ...value, ...repeatSettings };

    if (repeatSettings.repeat_type && repeatSettings.repeat_type !== 'none' && !nextValue.due_date) {
      nextValue.due_date = TimeZoneUtils.getTodayDateString();
    }

    emitChange(nextValue, [...Object.keys(repeatSettings), 'due_date']);
  };

  const handleDateChange = (date) => {
    handleFieldChange('due_date', date);
  };

  const handleTimeChange = (time) => {
    handleFieldChange('due_time', time);
  };

  return (
    <Box>
      <TextField
        autoFocus={mode === 'create'}
        margin="dense"
        label={fields.contentLabel}
        placeholder={fields.contentPlaceholder}
        fullWidth
        variant="outlined"
        value={value.content || ''}
        onChange={(e) => handleFieldChange('content', e.target.value)}
        sx={{ mb: 2 }}
        error={Boolean(errors.content)}
        helperText={errors.content}
      />

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={Boolean(value.is_important)}
              onChange={handleCheckboxChange('is_important')}
            />
          }
          label={fields.importantLabel}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={Boolean(value.is_urgent)}
              onChange={handleCheckboxChange('is_urgent')}
            />
          }
          label={fields.urgentLabel}
        />
      </Box>

      <TagInput
        value={value.tags || ''}
        onChange={handleTagChange}
        getSuggestions={getTagSuggestions}
        placeholder={fields.tagsPlaceholder}
        error={Boolean(errors.tags)}
        helperText={errors.tags}
        sx={{ mb: 2 }}
      />

      <RepeatSettings
        value={{
          repeat_type: value.repeat_type,
          repeat_interval: value.repeat_interval,
          repeat_days: value.repeat_days
        }}
        onChange={handleRepeatSettingsChange}
      />

      <DateTimePicker
        dateValue={value.due_date || ''}
        timeValue={value.due_time || ''}
        onDateChange={handleDateChange}
        onTimeChange={handleTimeChange}
        dateLabel={fields.dateLabel}
        timeLabel={fields.timeLabel}
        disableDate={value.repeat_type && value.repeat_type !== 'none'}
        sx={{ mb: 1.5, mt: 2 }}
      />

      {(errors.due_date || errors.due_time) && (
        <FormHelperText error sx={{ mt: -1.5, mb: 2 }}>
          {errors.due_date || errors.due_time}
        </FormHelperText>
      )}
    </Box>
  );
};

export default TodoFormFields;

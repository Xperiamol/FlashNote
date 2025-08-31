import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

const CalendarView = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '400px'
      }}
    >
      <Typography
        variant="h5"
        sx={{
          color: theme.palette.text.secondary,
          textAlign: 'center'
        }}
      >
        日历功能开发中...
      </Typography>
    </Box>
  );
};

export default CalendarView;
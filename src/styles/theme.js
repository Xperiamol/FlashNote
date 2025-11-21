import { createTheme } from '@mui/material/styles';

/**
 * Create the application theme based on mode and primary color
 * @param {string} mode - 'light' or 'dark'
 * @param {string} primaryColor - Hex color string
 * @returns {object} MUI Theme object
 */
export const createAppTheme = (mode = 'light', primaryColor = '#1976d2') => {
    // Ensure mode is valid
    const validMode = mode === 'dark' ? 'dark' : 'light';

    return createTheme({
        palette: {
            mode: validMode,
            primary: {
                main: primaryColor,
            },
            background: {
                default: validMode === 'dark' ? '#121212' : '#f5f5f5',
                paper: validMode === 'dark' ? '#1e1e1e' : '#ffffff',
            },
        },
        typography: {
            fontFamily: [
                '-apple-system',
                'BlinkMacSystemFont',
                '"Segoe UI"',
                'Roboto',
                '"Helvetica Neue"',
                'Arial',
                'sans-serif',
                '"Apple Color Emoji"',
                '"Segoe UI Emoji"',
                '"Segoe UI Symbol"',
            ].join(','),
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    body: {
                        scrollbarColor: validMode === 'dark' ? '#6b6b6b #2b2b2b' : '#959595 #f5f5f5',
                        '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
                            backgroundColor: 'transparent',
                            width: '8px',
                            height: '8px',
                        },
                        '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
                            borderRadius: '8px',
                            backgroundColor: validMode === 'dark' ? '#6b6b6b' : '#959595',
                            minHeight: '24px',
                            border: '2px solid transparent',
                            backgroundClip: 'content-box',
                        },
                        '&::-webkit-scrollbar-thumb:focus, & *::-webkit-scrollbar-thumb:focus': {
                            backgroundColor: validMode === 'dark' ? '#7b7b7b' : '#858585',
                        },
                        '&::-webkit-scrollbar-thumb:active, & *::-webkit-scrollbar-thumb:active': {
                            backgroundColor: validMode === 'dark' ? '#8b8b8b' : '#757575',
                        },
                        '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
                            backgroundColor: validMode === 'dark' ? '#8b8b8b' : '#757575',
                        },
                        '&::-webkit-scrollbar-corner, & *::-webkit-scrollbar-corner': {
                            backgroundColor: 'transparent',
                        },
                    },
                },
            },
            MuiButton: {
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                    },
                },
            },
        },
    });
};

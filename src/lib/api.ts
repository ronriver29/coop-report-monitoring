export const apiRequest = async (url: string, options: RequestInit = {}) => {
  let token = localStorage.getItem('cda_token');
  
  // Robust check for stringified null/undefined from localStorage
  if (token === 'null' || token === 'undefined' || !token) {
    token = null;
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  
  // Ensure we don't double slash if url starts with /
  const fullUrl = url.startsWith('http') ? url : `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  
  const headers = {
    ...options.headers,
    'Authorization': token ? `Bearer ${token}` : '',
  };

  try {
    const response = await fetch(fullUrl, { ...options, headers });

    if (response.status === 401) {
      // Don't redirect if we're already on the login page or trying to login
      const isAuthPath = url.includes('/api/auth/login') || url.includes('/api/auth/google');
      if (!isAuthPath) {
        console.warn(`Unauthorized access to ${url}, redirecting to login...`);
        // Clear credentials and reload to force login redirect
        localStorage.removeItem('cda_token');
        localStorage.removeItem('cda_user');
        
        const base = import.meta.env.BASE_URL || '/';
        const redirectUrl = `${base}${base.endsWith('/') ? '' : '/'}?expired=true`;
        
        // Only redirect if not already at the final destination to avoid loops
        if (!window.location.search.includes('expired=true')) {
          window.location.href = redirectUrl;
        }
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      console.warn(`API Request to ${url} failed with status ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'Session expired') {
      throw error;
    }
    console.error('API Request failure:', error);
    throw error;
  }
};

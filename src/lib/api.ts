export const apiRequest = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('cda_token');
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  
  // Ensure we don't double slash if url starts with /
  const fullUrl = url.startsWith('http') ? url : `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  
  const headers = {
    ...options.headers,
    'Authorization': token ? `Bearer ${token}` : '',
  };

  try {
    const response = await fetch(fullUrl, { ...options, headers });

    if (!response.ok) {
      console.warn(`API Request to ${url} failed with status ${response.status}`);
    }

    if (response.status === 401) {
      // Clear credentials and reload to force login redirect
      localStorage.removeItem('cda_token');
      localStorage.removeItem('cda_user');
      const base = import.meta.env.BASE_URL || '/';
      window.location.href = `${base}${base.endsWith('/') ? '' : '/'}?expired=true`;
      throw new Error('Session expired');
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

export const apiRequest = async (url: string, options: RequestInit = {}) => {
  let token = localStorage.getItem('cda_token');
  
  // Robust check for stringified null/undefined from localStorage
  if (token === 'null' || token === 'undefined' || !token) {
    token = null;
  }

  let baseUrl = '';
  
  // Ignore configured localhost API base URLs when previewed on a real external hostname
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      baseUrl = '';
    }
  }
  
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
  } catch (error: any) {
    if (error instanceof Error && error.message === 'Session expired') {
      throw error;
    }
    
    // Identify standard network/fetch exceptions (e.g., during dev server restarts or disconnects)
    const isNetworkError = error instanceof TypeError || 
                           (error && error.message && (
                             error.message.toLowerCase().includes('failed to fetch') || 
                             error.message.toLowerCase().includes('networkerror') ||
                             error.message.toLowerCase().includes('load failed')
                           ));

    if (isNetworkError) {
      console.warn(`📡 Network connection offline or server restarting for API endpoint: ${url}`);
      if (error && typeof error === 'object') {
        error.isNetworkError = true;
      }
    } else {
      console.error('API Request failure:', error);
    }
    throw error;
  }
};

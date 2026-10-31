import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401 && location.pathname !== '/login') location.assign('/login')
    },
  }),
  defaultOptions: {
    queries: { retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <App />
          <Toaster position="bottom-center" />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

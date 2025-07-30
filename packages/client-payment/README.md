# @owlmeans/client-payment

The **@owlmeans/client-payment** package provides client-side payment functionality for OwlMeans Common Libraries, designed for fullstack microservices and microclients development with focus on security and proper authentication and authorization.

## Purpose

This package serves as the client-side implementation of the OwlMeans payment system that:

- **Provides client-side payment services** with authentication integration
- **Implements shallow authentication** for payment identification
- **Integrates with client auth resources** for seamless user experience
- **Supports payment profile management** with local caching
- **Offers secure payment processing** with proper error handling
- **Enables payment workflow management** in client applications

## Core Concepts

### Client Payment Service
A client-side service that extends the base payment service with client-specific functionality, including integration with client authentication resources.

### Shallow Authentication
A lightweight authentication mechanism for payment operations that caches payment profile information locally to avoid repeated authentication requests.

### Payment Profile Integration
Seamless integration with user authentication to automatically manage payment profiles and user identification for payment operations.

### Local Caching
Payment profile information is cached locally using client auth resources to improve performance and user experience.

## API Reference

### Factory Functions

#### `makePaymentService(alias?): PaymentService`

Creates a client-side payment service with enhanced authentication capabilities.

```typescript
import { makePaymentService } from '@owlmeans/client-payment'

const paymentService = makePaymentService('payments')
```

**Parameters:**
- `alias`: string (optional) - Service alias, defaults to `DEFAULT_ALIAS` from `@owlmeans/payment`

**Returns:** PaymentService instance with client-side enhancements

#### `appendPaymentService(context, alias?): Context`

Registers a payment service with a client context.

```typescript
import { appendPaymentService } from '@owlmeans/client-payment'
import { makeClientContext } from '@owlmeans/client-context'

const context = makeClientContext(config)
appendPaymentService(context, 'payments')
```

**Parameters:**
- `context`: Client context instance
- `alias`: string (optional) - Service alias

**Returns:** Context with registered payment service

### Service Methods

The client payment service extends the base PaymentService with enhanced authentication:

#### `shallowAuthentication(token?): Promise<string>`

Performs lightweight authentication for payment operations with local caching.

```typescript
const paymentService = context.service('payments')

// First call - authenticates and caches profile
const profileId = await paymentService.shallowAuthentication('auth-token')

// Subsequent calls - uses cached profile
const cachedProfileId = await paymentService.shallowAuthentication()
```

**Parameters:**
- `token`: string (optional) - Authentication token for initial authentication

**Returns:** Promise resolving to payment profile ID

**Behavior:**
- If `token` is provided: Authenticates using the token and caches the result
- If `token` is null: Attempts to use cached authentication data
- Throws `PaymentIdentificationError` if no cached data exists and no token provided

### Types

#### `PaymentService`

The payment service interface (re-exported from `@owlmeans/payment`).

```typescript
export type { PaymentService } from '@owlmeans/payment'
```

### Constants

#### `DEFAULT_ALIAS`

Default alias for payment services (re-exported from `@owlmeans/payment`).

```typescript
export { DEFAULT_ALIAS } from '@owlmeans/payment'
```

#### `SHALLOW_AUTH`

Local storage key for cached payment authentication data.

```typescript
const SHALLOW_AUTH = 'payment:shallow-auth'
```

## Usage Examples

### Basic Payment Service Setup

```typescript
import { makeClientContext, makeClientConfig } from '@owlmeans/client-context'
import { appendPaymentService } from '@owlmeans/client-payment'
import { AppType } from '@owlmeans/context'

// Create client context
const config = makeClientConfig(AppType.Frontend, 'ecommerce-app')
const context = makeClientContext(config)

// Add payment service
appendPaymentService(context, 'payments')

// Configure and initialize
context.configure()
await context.init()

// Use payment service
const paymentService = context.service('payments')
```

### Payment with Authentication

```typescript
import { makePaymentService } from '@owlmeans/client-payment'
import { PaymentIdentificationError } from '@owlmeans/payment'

const paymentService = makePaymentService('payments')

try {
  // First-time authentication
  const profileId = await paymentService.shallowAuthentication(userAuthToken)
  console.log('Payment profile:', profileId)
  
  // Subsequent calls use cached data
  const cachedProfileId = await paymentService.shallowAuthentication()
  console.log('Cached profile:', cachedProfileId)
  
} catch (error) {
  if (error instanceof PaymentIdentificationError) {
    console.log('Payment identification failed:', error.message)
    // Redirect to authentication
  }
}
```

### E-commerce Integration

```typescript
import { appendPaymentService } from '@owlmeans/client-payment'

const setupEcommerceApp = async () => {
  const context = makeClientContext(config)
  
  // Register payment service
  appendPaymentService(context, 'checkout')
  
  await context.configure().init()
  
  return context
}

const processCheckout = async (context, items, userToken) => {
  const paymentService = context.service('checkout')
  
  try {
    // Authenticate for payment
    const profileId = await paymentService.shallowAuthentication(userToken)
    
    // Process payment
    const paymentRequest = {
      profileId,
      items,
      total: items.reduce((sum, item) => sum + item.price, 0)
    }
    
    const result = await paymentService.processPayment(paymentRequest)
    return result
    
  } catch (error) {
    console.error('Payment failed:', error)
    throw error
  }
}
```

### Subscription Service

```typescript
import { makePaymentService } from '@owlmeans/client-payment'

const subscriptionService = makePaymentService('subscriptions')

const manageSubscription = async (userToken, subscriptionPlan) => {
  try {
    // Authenticate user for payment
    const profileId = await subscriptionService.shallowAuthentication(userToken)
    
    // Create subscription
    const subscription = await subscriptionService.createSubscription({
      profileId,
      plan: subscriptionPlan,
      recurring: true
    })
    
    console.log('Subscription created:', subscription.id)
    return subscription
    
  } catch (error) {
    console.error('Subscription failed:', error)
    throw error
  }
}

// Later, manage existing subscription without re-authentication
const updateSubscription = async (subscriptionId, newPlan) => {
  try {
    // Use cached authentication
    const profileId = await subscriptionService.shallowAuthentication()
    
    const updated = await subscriptionService.updateSubscription(subscriptionId, {
      plan: newPlan,
      profileId
    })
    
    return updated
  } catch (error) {
    if (error instanceof PaymentIdentificationError) {
      // Re-authentication required
      console.log('Please re-authenticate for subscription changes')
    }
    throw error
  }
}
```

### Mobile App Integration

```typescript
import { appendPaymentService } from '@owlmeans/client-payment'

const setupMobilePayments = async () => {
  const context = makeClientContext(mobileConfig)
  
  appendPaymentService(context, 'mobile-payments')
  
  await context.configure().init()
  
  const paymentService = context.service('mobile-payments')
  
  // Setup payment handlers for mobile
  const handlePurchase = async (productId, userToken) => {
    try {
      const profileId = await paymentService.shallowAuthentication(userToken)
      
      const purchase = await paymentService.processMobilePurchase({
        profileId,
        productId,
        platform: 'mobile'
      })
      
      // Handle successful purchase
      await unlockPremiumFeatures(purchase)
      
    } catch (error) {
      // Handle payment error
      showPaymentError(error)
    }
  }
  
  return handlePurchase
}
```

### Payment Status Tracking

```typescript
import { makePaymentService } from '@owlmeans/client-payment'

const paymentService = makePaymentService('payment-tracker')

const trackPaymentStatus = async (paymentId, userToken) => {
  try {
    // Authenticate for payment tracking
    const profileId = await paymentService.shallowAuthentication(userToken)
    
    // Poll payment status
    const checkStatus = async () => {
      const status = await paymentService.getPaymentStatus(paymentId, profileId)
      
      switch (status.state) {
        case 'pending':
          console.log('Payment is being processed...')
          setTimeout(checkStatus, 5000) // Check again in 5 seconds
          break
        case 'completed':
          console.log('Payment completed successfully!')
          handlePaymentSuccess(status)
          break
        case 'failed':
          console.log('Payment failed:', status.error)
          handlePaymentFailure(status)
          break
      }
    }
    
    await checkStatus()
    
  } catch (error) {
    console.error('Payment tracking failed:', error)
  }
}
```

### Error Handling

```typescript
import { PaymentIdentificationError } from '@owlmeans/payment'
import { makePaymentService } from '@owlmeans/client-payment'

const handlePaymentErrors = async (userToken, paymentData) => {
  const paymentService = makePaymentService('error-handling')
  
  try {
    const profileId = await paymentService.shallowAuthentication(userToken)
    const result = await paymentService.processPayment({ ...paymentData, profileId })
    return result
    
  } catch (error) {
    if (error instanceof PaymentIdentificationError) {
      // Authentication/identification specific error
      switch (error.message) {
        case 'record':
          console.log('No cached payment profile found, please authenticate')
          // Redirect to authentication flow
          break
        default:
          console.log('Payment identification error:', error.message)
      }
    } else {
      // Other payment errors
      console.error('Payment processing error:', error)
    }
    
    throw error
  }
}
```

## Integration Patterns

### With React Applications

```typescript
import React, { useContext, useEffect, useState } from 'react'
import { useContext as useOwlMeansContext } from '@owlmeans/client'
import { PaymentIdentificationError } from '@owlmeans/payment'

const PaymentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const context = useOwlMeansContext()
  const [paymentService, setPaymentService] = useState(null)
  
  useEffect(() => {
    const service = context.service('payments')
    setPaymentService(service)
  }, [context])
  
  return (
    <PaymentContext.Provider value={paymentService}>
      {children}
    </PaymentContext.Provider>
  )
}

const usePayment = () => {
  const paymentService = useContext(PaymentContext)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  
  const authenticate = async (token: string) => {
    try {
      await paymentService.shallowAuthentication(token)
      setIsAuthenticated(true)
    } catch (error) {
      setIsAuthenticated(false)
      throw error
    }
  }
  
  const processPayment = async (paymentData) => {
    if (!isAuthenticated) {
      throw new Error('Payment authentication required')
    }
    
    return await paymentService.processPayment(paymentData)
  }
  
  return { authenticate, processPayment, isAuthenticated }
}
```

### With State Management

```typescript
// Redux/Zustand store integration
const usePaymentStore = create((set, get) => ({
  profileId: null,
  isAuthenticated: false,
  
  authenticate: async (token: string) => {
    try {
      const paymentService = get().paymentService
      const profileId = await paymentService.shallowAuthentication(token)
      
      set({ profileId, isAuthenticated: true })
      return profileId
    } catch (error) {
      set({ profileId: null, isAuthenticated: false })
      throw error
    }
  },
  
  clearAuthentication: () => {
    set({ profileId: null, isAuthenticated: false })
  }
}))
```

## Security Considerations

### Authentication Management
- **Token Security** - Always handle authentication tokens securely
- **Profile Caching** - Cached payment profiles are stored locally and should be cleared on logout
- **Error Handling** - Properly handle authentication errors to prevent security leaks

### Payment Security
- **Shallow Authentication** - Provides lightweight authentication suitable for payment operations
- **Profile Validation** - Always validate payment profiles before processing payments
- **Error Messages** - Avoid exposing sensitive information in error messages

## Best Practices

1. **Handle authentication gracefully** - Always check for cached authentication before requiring re-authentication
2. **Clear cached data on logout** - Ensure payment profiles are cleared when users log out
3. **Implement proper error handling** - Handle `PaymentIdentificationError` specifically
4. **Use context registration** - Register payment services with application context for dependency injection
5. **Monitor payment status** - Implement proper payment status tracking and user feedback

## Error Handling

The package handles various error scenarios:

- **PaymentIdentificationError** - Thrown when payment profile identification fails
- **Authentication errors** - When cached authentication data is invalid or missing
- **Network errors** - When payment service communication fails
- **Context errors** - When service context is not properly configured

## Dependencies

This package depends on:
- `@owlmeans/payment` - Core payment functionality and types
- `@owlmeans/client-auth` - Client-side authentication resources
- `@owlmeans/context` - Context management and service registration

## Related Packages

- [`@owlmeans/payment`](../payment) - Core payment functionality
- [`@owlmeans/client-auth`](../client-auth) - Client-side authentication
- [`@owlmeans/client-context`](../client-context) - Client context management
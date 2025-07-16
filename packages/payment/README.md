# @owlmeans/payment

A comprehensive payment system library that provides the foundational components for implementing payment functionality in OwlMeans applications. This package includes product management, subscription handling, localization support, and capability-based access control.

## Overview

The `@owlmeans/payment` package is part of the OwlMeans Common library ecosystem and provides essential abstractions for payment systems. It follows the OwlMeans package structure conventions and integrates seamlessly with other OwlMeans packages for authentication, configuration, resources, and internationalization.

### Key Features

- **Product Management**: Define and manage products with different types (simple, service)
- **Subscription Plans**: Create flexible pricing plans with various durations and trial periods
- **Subscription Lifecycle**: Handle subscription states from creation to cancellation
- **Multi-language Support**: Built-in internationalization for global applications
- **Capability-based Access**: Integration with OwlMeans auth system for permissions
- **Usage Tracking**: Monitor and limit resource consumption
- **Multiple Payment Gateways**: Support for various payment providers
- **Flexible Configuration**: Easy integration with OwlMeans configuration system

## Installation

```bash
npm install @owlmeans/payment
```

### Peer Dependencies

This package requires the following peer dependencies:

```bash
npm install ajv
```

## Core Concepts

### Products

Products represent items or services that can be purchased. Each product has:

- **Type**: `simple` for physical/digital goods, `service` for software services
- **SKU**: Unique identifier for the product
- **Title & Description**: Human-readable information
- **Services**: Related software services
- **Capabilities**: Permission sets granted when purchased

### Plans

Plans define pricing and access terms for products:

- **Duration**: Monthly, yearly, lifetime, reusable, or consumable
- **Pricing**: Base price, currency, discounts, and original price
- **Trials**: Free trial periods (gated or open)
- **Capabilities**: Specific permissions granted
- **Limits**: Usage restrictions and quotas

### Subscriptions

Subscriptions represent active plan purchases:

- **Status**: Created, trial, active, canceled, expired, etc.
- **Dates**: Creation, start, expiration, and cancellation timestamps
- **Consumption**: Track usage against limits
- **Payment Method**: Associated payment gateway information

### Localization

Multi-language support for products, plans, and capabilities:

- **Language-specific**: Titles, descriptions, and keywords
- **Fallback Support**: Default language fallback system
- **Dynamic Loading**: Runtime language switching

## API Reference

### Types

#### Product

```typescript
interface Product {
  type: ProductType                    // 'simple' | 'service'
  sku: string                         // Unique product identifier
  title: string                       // Product name
  description?: string                // Product description
  defaultLng?: string                 // Default language code
  services?: string[]                 // Related software services
  capabilities?: PermissionSet[]      // Granted permissions
}
```

#### ProductPlan

```typescript
interface ProductPlan {
  productSku: string                  // Parent product SKU
  sku: string                         // Unique plan identifier
  status: PlanStatus                  // Plan availability status
  duration: PlanDuration              // Billing cycle
  price: number                       // Plan price
  currency?: string                   // Currency code (e.g., 'USD')
  title: string                       // Plan name
  description?: string                // Plan description
  
  // Trial configuration
  trial?: number                      // Trial period in days
  gatedTrial?: boolean               // Requires payment method
  
  // Pricing details
  originalPrice?: number             // Before discount
  discount?: number                  // Discount percentage
  highlight?: string                 // Special badge/label
  
  // Scheduling
  createdAt?: Date                   // Creation timestamp
  archivedAt?: Date                  // Archive timestamp
  deprecatedAt?: Date                // Deprecation date
  supsendedAt?: Date                 // Suspension date
  
  // Access control
  capabilities?: PermissionSet[]     // Granted permissions
  limits?: { [key: string]: LimitConfig } // Usage limits
  
  // Payment gateway integration
  payagateAliases?: { [paygate: string]: string }
}
```

#### PlanSubscription

```typescript
interface PlanSubscription {
  sku: string                        // Plan SKU
  entityId: string                   // Subscriber entity ID
  status: SubscriptionStatus         // Current status
  
  // Timestamps
  createdAt: Date                    // Creation time
  startsdAt: Date                    // Start time
  expirationAt?: Date                // Expiration time
  endsAt?: Date                      // End time
  trialUntil?: Date                  // Trial end time
  lastPaymentAt?: Date               // Last payment time
  
  // State management
  canceledAt?: Date                  // Cancellation time
  suspendedAt?: Date                 // Suspension time
  suspendedUntil?: Date              // Suspension end time
  blockedAt?: Date                   // Block time
  archiveAt?: Date                   // Archive time
  
  // Payment integration
  paymentMethod?: string             // Payment method ID
  externalId?: string                // External payment system ID
  
  // Access control
  capabilities?: PermissionSet[]     // Custom permissions
  limits?: { [key: string]: LimitConfig } // Custom limits
  consumptions?: { [key: string]: CapabilityUsage } // Usage tracking
}
```

#### Localization

```typescript
interface Localization {
  sku: string                        // Entity SKU
  type: PaymentEntityType            // Entity type
  lng: string                        // Language code
  title?: string                     // Localized title
  description?: string               // Localized description
  keywords?: { [key: string]: string } // Localized keywords
}
```

### Enums

#### ProductType

```typescript
enum ProductType {
  Simple = 'simple',    // Physical or digital goods
  Service = 'service'   // Software services
}
```

#### PlanStatus

```typescript
enum PlanStatus {
  Active = 'active',         // Available for purchase
  Custom = 'custom',         // Custom/negotiated plan
  Hidden = 'hidden',         // Hidden from public
  Archived = 'archived',     // No longer available
  Deprecated = 'deprecated', // Will be removed
  Suspended = 'suspended'    // Temporarily unavailable
}
```

#### PlanDuration

```typescript
enum PlanDuration {
  Monthly = 'monthly',       // Monthly billing
  Yearly = 'yearly',         // Yearly billing
  Lifetime = 'lifetime',     // One-time payment
  Reusable = 'reusable',     // Can be used multiple times
  Consumable = 'consumable'  // Requires tokens/credits
}
```

#### SubscriptionStatus

```typescript
enum SubscriptionStatus {
  Created = 'created',       // Just created
  Trial = 'trial',           // In trial period
  Active = 'active',         // Active subscription
  Canceled = 'canceled',     // User canceled
  Expired = 'expired',       // Expired subscription
  Suspended = 'suspended',   // Temporarily suspended
  Blocked = 'blocked',       // Blocked by admin
  Ended = 'ended',           // Naturally ended
  Free = 'free'              // Free tier
}
```

### PaymentService

The main service interface for payment operations:

```typescript
interface PaymentService extends InitializedService {
  // Get product by SKU
  product(sku: string): Promise<Product>
  
  // Get plans for a product and duration
  plans(productSku: string, duration: PlanDuration): Promise<ProductPlan[]>
  
  // Get localization for an entity
  localize(lng: string, entity: PaymentEntity): Promise<Localization | null>
  
  // Authenticate user from token
  shallowAuthentication(token: string | null): Promise<string>
}
```

### Service Creation

```typescript
import { makePaymentService, appendPaymentService } from '@owlmeans/payment'

// Create payment service
const paymentService = makePaymentService('payment')

// Add to context
const contextWithPayment = appendPaymentService(context, 'payment')
```

### Usage Examples

#### Basic Product Management

```typescript
import { makePaymentService } from '@owlmeans/payment'

const paymentService = makePaymentService()

// Get a product
const product = await paymentService.product('premium-software')

// Get plans for monthly billing
const monthlyPlans = await paymentService.plans('premium-software', PlanDuration.Monthly)

// Get localization
const localization = await paymentService.localize('en', product)
```

#### Creating Products

```typescript
import { Product, ProductType } from '@owlmeans/payment'

const product: Product = {
  type: ProductType.Service,
  sku: 'premium-service',
  title: 'Premium Service',
  description: 'Advanced features and priority support',
  defaultLng: 'en',
  services: ['api-service', 'analytics-service'],
  capabilities: [
    { scope: 'premium', permissions: ['read', 'write'] }
  ]
}
```

#### Subscription Management

```typescript
import { PlanSubscription, SubscriptionStatus } from '@owlmeans/payment'

const subscription: PlanSubscription = {
  sku: 'premium-monthly',
  entityId: 'user-123',
  status: SubscriptionStatus.Active,
  createdAt: new Date(),
  startsdAt: new Date(),
  expirationAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  paymentMethod: 'stripe-card-456',
  capabilities: [
    { scope: 'premium', permissions: ['read', 'write'] }
  ],
  limits: {
    'api-calls': {
      interval: PlanDuration.Monthly,
      limit: 10000,
      measurment: 'requests'
    }
  }
}
```

## Configuration

### Context Integration

The payment service integrates with the OwlMeans context system:

```typescript
import { makeContext } from '@owlmeans/context'
import { appendPaymentService } from '@owlmeans/payment'

const context = makeContext(config)
const paymentContext = appendPaymentService(context, 'payment')
```

### Resource Configuration

Products, plans, and localizations are stored as configuration records:

```typescript
// Product record ID format
const productId = `${PRODUCT_RECORD_PREFIX}:${productSku}`

// Plan record ID format  
const planId = `${PLAN_RECORD_PREFIX}:${planSku}`

// Localization record ID format
const l10nId = `${L10N_RECORD_PREFIX}:${type}:${sku}:${lng}`
```

## Error Handling

The package provides comprehensive error types for different scenarios:

### Error Hierarchy

```typescript
PaymentError                    // Base payment error
├── PaygateError               // Payment gateway errors
│   ├── UnknownPaygate         // Unknown payment gateway
│   └── PaygateMappingError    // Gateway mapping issues
├── ProductError               // Product-related errors
│   ├── UnknownProduct         // Product not found
│   └── UnknownPlan            // Plan not found
├── PaymentIdentificationError // Authentication issues
└── SubscriptionError          // Subscription errors
    └── UnknownSubscription    // Subscription not found
```

### Error Usage

```typescript
import { UnknownProduct, PaymentIdentificationError } from '@owlmeans/payment'

try {
  const product = await paymentService.product('invalid-sku')
} catch (error) {
  if (error instanceof UnknownProduct) {
    console.log('Product not found:', error.message)
  }
}
```

## Internationalization

### Built-in Translations

The package includes English translations for common payment terms:

```typescript
// Plan durations
"plan.duration.monthly": "Monthly subscription"
"plan.duration.yearly": "Yearly subscription"

// Trial periods
"plan.trial.gated": "Free trial — {{days}} days"
"plan.trial.open": "No card required — {{days}} free trial"

// Highlights
"plan.highlight.best-value": "Best value!"
"plan.highlight.custom": "Tell us about your custom needs"

// Actions
"action.start": "Start now"
"action.subscribe": "Subscribe now"
```

### Custom Localization

```typescript
import { Localization, PaymentEntityType } from '@owlmeans/payment'

const localization: Localization = {
  sku: 'premium-service',
  type: PaymentEntityType.Product,
  lng: 'es',
  title: 'Servicio Premium',
  description: 'Características avanzadas y soporte prioritario',
  keywords: {
    'premium': 'premium',
    'support': 'soporte'
  }
}
```

## API Routes

The package provides pre-configured API routes:

### Subscription API

```typescript
import { modules } from '@owlmeans/payment'

// Available routes:
// GET /subscription - Base subscription endpoint
// POST /subscription/propogate - Propagate subscription changes
```

### Route Configuration

```typescript
import { paymentApi } from '@owlmeans/payment'

// API endpoint constants
paymentApi.subscription.base      // 'payment-api:subscription'
paymentApi.subscription.propogate // 'payment-api:subscription:propogate'
```

## JSON Schema Validation

All data types include JSON Schema definitions for validation:

```typescript
import { ProductSchema, ProductPlanSchema, PlanSubscriptionSchema } from '@owlmeans/payment'

// Validate product data
const isValidProduct = ajv.validate(ProductSchema, productData)

// Validate plan data
const isValidPlan = ajv.validate(ProductPlanSchema, planData)

// Validate subscription data
const isValidSubscription = ajv.validate(PlanSubscriptionSchema, subscriptionData)
```

## Integration with Other OwlMeans Packages

### Dependencies

- `@owlmeans/auth` - Authentication and permissions
- `@owlmeans/basic-envelope` - Message envelope handling
- `@owlmeans/config` - Configuration management
- `@owlmeans/context` - Application context
- `@owlmeans/error` - Error handling
- `@owlmeans/i18n` - Internationalization
- `@owlmeans/module` - Module system
- `@owlmeans/resource` - Resource management
- `@owlmeans/route` - Route definitions

### Common Integration Patterns

```typescript
// With authentication
import { PermissionSet } from '@owlmeans/auth'
import { Product } from '@owlmeans/payment'

const product: Product = {
  // ... other properties
  capabilities: [
    { scope: 'premium', permissions: ['read', 'write'] }
  ]
}

// With configuration
import { fromConfigRecord } from '@owlmeans/config'
import { Product } from '@owlmeans/payment'

const product = fromConfigRecord<ConfigRecord, Product>(configRecord)

// With resources
import { ResourceRecord } from '@owlmeans/resource'
import { Product } from '@owlmeans/payment'

type ProductRecord = Product & ResourceRecord
```

## Best Practices

1. **Product SKUs**: Use descriptive, URL-friendly SKUs
2. **Plan Structure**: Organize plans logically by product and duration
3. **Localization**: Provide fallback translations for all supported languages
4. **Error Handling**: Use specific error types for better debugging
5. **Capabilities**: Define granular permissions for fine-grained access control
6. **Limits**: Set reasonable usage limits with appropriate intervals
7. **Trials**: Use gated trials for premium features, open trials for basic access

## Contributing

This package is part of the OwlMeans Common library ecosystem. Follow the established patterns and conventions when extending functionality.

## License

See the main repository LICENSE file for details.
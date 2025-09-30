# API Testing Client

A comprehensive API testing assistant that helps you test, debug, and document REST APIs interactively.

## Features
- 🔍 Tests CRUD operations (GET, POST, PUT, DELETE)
- ✅ Validates response codes and data structures
- ⏱️ Measures response times
- 🔐 Handles various authentication methods
- 📝 Generates API documentation
- 🧪 Creates reusable test suites

## Usage

```bash
# Test a public API
delta run --agent examples/api-tester --task "Test the JSONPlaceholder API at https://jsonplaceholder.typicode.com"

# Interactive mode - asks for API details
delta run -i --agent examples/api-tester --task "Help me test my REST API"

# Test with authentication
delta run -i --agent examples/api-tester --task "Test authenticated endpoints (will ask for API key)"

# Create a test suite
delta run --agent examples/api-tester --task "Create a comprehensive test suite for a user management API"

# Performance testing
delta run --agent examples/api-tester --task "Test response times for all endpoints"
```

## Supported Features

### HTTP Methods
- GET - Retrieve resources
- POST - Create new resources
- PUT - Update existing resources
- DELETE - Remove resources
- PATCH - Partial updates

### Authentication Types
- Bearer tokens
- API keys (header/query)
- Basic authentication
- Custom headers

### Validation
- Status codes (2xx, 4xx, 5xx)
- Response time thresholds
- JSON schema validation
- Required fields checking
- Data type verification

## Example Output

### Test Results
```markdown
# API Test Results

## ✅ GET /api/users
- Status: 200 OK
- Response Time: 89ms
- Records: 10 users returned

## ✅ POST /api/users
- Status: 201 Created
- Response Time: 156ms
- Created: User ID #11

## ❌ GET /api/users/999
- Status: 404 Not Found
- Error: User not found
```

### Test Suite
```json
{
  "baseUrl": "https://api.example.com",
  "tests": [
    {
      "name": "List all users",
      "method": "GET",
      "endpoint": "/users",
      "expectedStatus": 200,
      "responseTime": 500
    },
    {
      "name": "Create user",
      "method": "POST",
      "endpoint": "/users",
      "data": {
        "name": "Test User",
        "email": "test@example.com"
      },
      "expectedStatus": 201
    }
  ]
}
```

## Common Test Scenarios

- **CRUD Operations**: Full create, read, update, delete cycle
- **Pagination**: Test limit, offset, page parameters
- **Filtering**: Query parameters and search functionality
- **Error Handling**: Invalid inputs, missing fields
- **Rate Limiting**: Respect and test rate limits
- **Bulk Operations**: Test batch endpoints
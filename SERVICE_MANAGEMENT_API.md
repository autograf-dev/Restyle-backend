# 🛠️ Service Management API Documentation

## Overview
Complete API endpoints for managing HighLevel calendar services, including CRUD operations, staff assignments, and configuration management.

## Base URL
All endpoints are Netlify functions accessible at:
```
https://your-netlify-site.netlify.app/.netlify/functions/
```

## Authentication
All endpoints use the same authentication pattern as existing functions:
- Automatic token refresh via `getValidAccessToken()`
- HighLevel API integration with proper headers

---

## 🎯 Core Service Management

### 1. Create Service
**Endpoint:** `POST /.netlify/functions/createService`

Creates a new calendar service in HighLevel.

**Request Body:**
```json
{
  "name": "Hair Cut Service",
  "description": "Professional hair cutting service",
  "duration": 60,
  "bufferTimeAfter": 15,
  "groupId": "group_id_here",
  "locationId": "7LYI93XFo8j4nZfswlaz",
  "teamMembers": ["staff_id_1", "staff_id_2"],
  "slotDuration": 60,
  "slotInterval": 60,
  "preBookingDays": 30,
  "allowBookingAfter": 1440,
  "allowBookingFor": 43200,
  "openHours": [
    {
      "day": "monday",
      "openHour": 9,
      "openMinute": 0,
      "closeHour": 17,
      "closeMinute": 0
    }
  ],
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Service created successfully",
  "service": { /* HighLevel service object */ },
  "serviceId": "new_service_id"
}
```

### 2. Update Service
**Endpoint:** `PUT /.netlify/functions/updateService?id=service_id`

Updates an existing service with new information.

**Request Body:**
```json
{
  "name": "Updated Service Name",
  "description": "Updated description",
  "duration": 90
}
```

**Response:**
```json
{
  "success": true,
  "message": "Service updated successfully",
  "service": { /* Updated service object */ },
  "serviceId": "service_id",
  "updatedFields": ["name", "description", "duration"]
}
```

### 3. Delete Service
**Endpoint:** `DELETE /.netlify/functions/deleteService?id=service_id`

Deletes a service from HighLevel.

**Response:**
```json
{
  "success": true,
  "message": "Service deleted successfully",
  "serviceId": "service_id",
  "deletedService": "Service Name"
}
```

### 4. Get Service Details
**Endpoint:** `GET /.netlify/functions/getServiceDetails?id=service_id`

Retrieves detailed information about a specific service.

**Response:**
```json
{
  "success": true,
  "service": {
    "id": "service_id",
    "name": "Service Name",
    "duration": 60,
    "durationDisplay": "60 minutes",
    "bufferDisplay": "15 minutes",
    "bookingWindow": {
      "afterHours": 24,
      "forDays": 30
    },
    "isActive": true,
    "teamMemberCount": 2,
    /* ... other service properties */
  }
}
```

---

## 👥 Staff Management

### 5. Assign Staff to Service
**Endpoint:** `POST /.netlify/functions/assignStaffToService?id=service_id`

Assigns staff members to a service.

**Request Body (Option 1 - Single Staff):**
```json
{
  "staffId": "staff_member_id"
}
```

**Request Body (Option 2 - Multiple Staff):**
```json
{
  "staffIds": ["staff_id_1", "staff_id_2", "staff_id_3"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Staff assigned to service successfully",
  "serviceId": "service_id",
  "addedStaff": ["staff_id_1", "staff_id_2"],
  "totalStaff": 5,
  "allTeamMembers": ["existing_staff", "staff_id_1", "staff_id_2"]
}
```

### 6. Remove Staff from Service
**Endpoint:** `DELETE /.netlify/functions/removeStaffFromService?id=service_id&staffId=staff_id`

Removes a specific staff member from a service.

**Response:**
```json
{
  "success": true,
  "message": "Staff removed from service successfully",
  "serviceId": "service_id",
  "removedStaff": "staff_id",
  "remainingStaff": 3,
  "allTeamMembers": ["remaining_staff_1", "remaining_staff_2"]
}
```

### 7. Get Service Staff
**Endpoint:** `GET /.netlify/functions/getServiceStaff?id=service_id&includeDetails=true`

Retrieves all staff assigned to a service.

**Query Parameters:**
- `id` (required): Service ID
- `includeDetails` (optional): Set to "true" to include full staff details

**Response (with details):**
```json
{
  "success": true,
  "serviceId": "service_id",
  "serviceName": "Service Name",
  "staffCount": 2,
  "staff": [
    {
      "id": "staff_id_1",
      "name": "John Doe",
      "email": "john@example.com",
      "displayName": "John Doe",
      "isActive": true
    }
  ]
}
```

### 8. Get All Available Staff
**Endpoint:** `GET /.netlify/functions/getAllStaff?locationId=location_id&includeInactive=false`

Retrieves all staff members available for assignment.

**Query Parameters:**
- `locationId` (optional): Defaults to your location ID
- `includeInactive` (optional): Set to "true" to include inactive staff

**Response:**
```json
{
  "success": true,
  "locationId": "location_id",
  "totalStaff": 10,
  "staff": [
    {
      "id": "staff_id",
      "name": "Jane Smith",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com",
      "displayName": "Jane Smith",
      "roleDisplay": "Staff Member",
      "isActive": true
    }
  ],
  "filters": {
    "includeInactive": false
  }
}
```

---

## ⚙️ Service Configuration

### 9. Update Service Configuration
**Endpoint:** `PUT /.netlify/functions/updateServiceConfig?id=service_id`

Updates service configuration including duration, pricing, and availability.

**Request Body:**
```json
{
  "duration": 90,
  "bufferTimeAfter": 20,
  "allowBookingAfter": 2880,
  "allowBookingFor": 86400,
  "openHours": [
    {
      "day": "monday",
      "openHour": 8,
      "openMinute": 0,
      "closeHour": 18,
      "closeMinute": 0
    }
  ],
  "isActive": true,
  "meetingLocation": "Salon Location",
  "eventColor": "#ff6b6b",
  "price": 75.00,
  "currency": "USD",
  "notifications": {
    "type": "email",
    "shouldSendToContact": true,
    "shouldSendToUser": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Service configuration updated successfully",
  "serviceId": "service_id",
  "updatedFields": ["duration", "bufferTimeAfter", "price"],
  "configuration": {
    "duration": 90,
    "bufferTime": 20,
    "bookingWindow": {
      "afterHours": 48,
      "forDays": 60
    },
    "isActive": true,
    "meetingLocation": "Salon Location",
    "price": 75.00
  }
}
```

---

## 🔧 Frontend Integration Examples

### React Component Example
```jsx
import axios from 'axios';

const ServiceManager = () => {
  const API_BASE = 'https://your-site.netlify.app/.netlify/functions';

  const createService = async (serviceData) => {
    try {
      const response = await axios.post(`${API_BASE}/createService`, serviceData);
      console.log('Service created:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error creating service:', error.response?.data);
      throw error;
    }
  };

  const getAllStaff = async () => {
    try {
      const response = await axios.get(`${API_BASE}/getAllStaff`);
      return response.data.staff;
    } catch (error) {
      console.error('Error fetching staff:', error);
      throw error;
    }
  };

  const assignStaffToService = async (serviceId, staffIds) => {
    try {
      const response = await axios.post(
        `${API_BASE}/assignStaffToService?id=${serviceId}`,
        { staffIds }
      );
      return response.data;
    } catch (error) {
      console.error('Error assigning staff:', error);
      throw error;
    }
  };

  return (
    <div>
      {/* Your service management UI here */}
    </div>
  );
};
```

### Service Management Workflow
```javascript
// 1. Fetch all available staff
const staff = await getAllStaff();

// 2. Create a new service
const newService = await createService({
  name: "Premium Hair Styling",
  duration: 120,
  groupId: "your_group_id",
  price: 150.00
});

// 3. Assign staff to the service
await assignStaffToService(newService.serviceId, [
  "staff_id_1", 
  "staff_id_2"
]);

// 4. Update service configuration
await updateServiceConfig(newService.serviceId, {
  bufferTimeAfter: 30,
  eventColor: "#4CAF50",
  openHours: customOpenHours
});
```

---

## 📋 Error Handling

All endpoints return consistent error formats:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error information"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created (for new services)
- `400` - Bad Request (missing parameters)
- `401` - Unauthorized (token issues)
- `404` - Not Found (service/staff not found)
- `405` - Method Not Allowed
- `500` - Server Error

---

## 🎯 Next Steps for Frontend

1. **Create Service Management Tab** with forms for:
   - Service creation with name, duration, description
   - Staff assignment dropdowns
   - Configuration panels for pricing, availability
   
2. **Staff Assignment Interface** with:
   - Multi-select dropdowns for staff assignment
   - Visual staff list with remove options
   - Real-time staff availability checking

3. **Service Configuration Panel** with:
   - Duration sliders
   - Price input fields
   - Availability calendar widget
   - Buffer time settings

4. **Service List View** with:
   - Grid/list of existing services
   - Quick edit options
   - Enable/disable toggles
   - Delete confirmations

The endpoints are now ready for your frontend team to integrate! 🚀
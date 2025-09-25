const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("💳 initializePayment function - LeadConnector Payment with tip calculations - 2025-09-25");

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Access token missing' })
      };
    }

    // Parse request body
    let requestData;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseErr) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const {
      appointmentData, // Array of appointments for this checkout
      customerInfo,    // Customer details
      tipPercentage = 15, // Default 15% tip
      customTipAmount = null, // Optional custom tip amount
      locationId = '7LYI93XFo8j4nZfswlaz'
    } = requestData;

    // Validation
    if (!appointmentData || !Array.isArray(appointmentData) || appointmentData.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'appointmentData array is required' })
      };
    }

    if (!customerInfo || !customerInfo.email) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'customerInfo with email is required' })
      };
    }

    console.log('💳 Processing payment for', appointmentData.length, 'appointments');

    // Process each appointment to get service details and pricing
    const processedAppointments = [];
    let totalServiceAmount = 0;

    for (const appointment of appointmentData) {
      const { calendarId, staffId, appointmentId } = appointment;

      if (!calendarId || !staffId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Each appointment must have calendarId and staffId' })
        };
      }

      // Get service/calendar details
      console.log('💳 Fetching service details for calendar:', calendarId);
      
      const serviceResponse = await axios.get(
        `https://services.leadconnectorhq.com/calendars/${calendarId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: '2021-04-15'
          }
        }
      );

      const serviceData = serviceResponse.data.calendar;

      // Extract price from service description (format: "CA$85.00")
      let servicePrice = 0;
      const description = serviceData.description || '';
      const priceMatch = description.match(/CA\$(\d+(?:\.\d{2})?)/);
      
      if (priceMatch) {
        servicePrice = parseFloat(priceMatch[1]);
      }

      // Get staff details
      console.log('💳 Fetching staff details for:', staffId);
      
      const staffResponse = await axios.get(
        `https://services.leadconnectorhq.com/users/${staffId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: '2021-04-15'
          }
        }
      );

      const staffData = staffResponse.data;

      // Process appointment data
      const processedAppointment = {
        appointmentId: appointmentId,
        calendarId: calendarId,
        serviceName: serviceData.name,
        serviceDescription: serviceData.description,
        servicePrice: servicePrice,
        staffId: staffId,
        staffName: staffData.name || `${staffData.firstName || ''} ${staffData.lastName || ''}`.trim(),
        staffEmail: staffData.email,
        duration: `${serviceData.slotDuration} ${serviceData.slotDurationUnit}`,
        serviceDetails: {
          eventColor: serviceData.eventColor,
          allowReschedule: serviceData.allowReschedule,
          allowCancellation: serviceData.allowCancellation
        }
      };

      processedAppointments.push(processedAppointment);
      totalServiceAmount += servicePrice;
    }

    // Calculate tip amounts and distribution
    const tipCalculation = calculateTipDistribution(
      processedAppointments, 
      totalServiceAmount, 
      tipPercentage, 
      customTipAmount
    );

    // Calculate totals
    const subtotal = totalServiceAmount;
    const tipAmount = tipCalculation.totalTipAmount;
    const taxes = calculateTaxes(subtotal, locationId); // Assume Canadian taxes
    const totalAmount = subtotal + tipAmount + taxes.totalTax;

    // Create payment line items for LeadConnector
    const lineItems = createPaymentLineItems(processedAppointments, tipCalculation, taxes);

    // Payment session data
    const paymentSessionData = {
      sessionId: `checkout_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      customerInfo: customerInfo,
      appointments: processedAppointments,
      pricing: {
        subtotal: subtotal,
        tipAmount: tipAmount,
        tipPercentage: customTipAmount ? 'custom' : tipPercentage,
        taxes: taxes,
        totalAmount: totalAmount,
        currency: 'CAD'
      },
      tipDistribution: tipCalculation.staffTipDistribution,
      lineItems: lineItems,
      locationId: locationId,
      createdAt: new Date().toISOString(),
      status: 'initialized'
    };

    console.log('💳 Payment initialized for total amount:', totalAmount);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Payment initialized successfully',
        paymentSession: paymentSessionData,
        nextStep: 'Create payment session with LeadConnector',
        debug: {
          totalAppointments: processedAppointments.length,
          totalStaff: tipCalculation.staffTipDistribution.length,
          servicePricesFound: processedAppointments.filter(a => a.servicePrice > 0).length
        }
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error initializing payment:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to initialize payment',
        details: message,
        debugInfo: {
          status: status,
          message: typeof message === 'string' ? message : JSON.stringify(message)
        }
      })
    };
  }
};

// Helper function to calculate tip distribution among staff
function calculateTipDistribution(appointments, totalServiceAmount, tipPercentage, customTipAmount) {
  let totalTipAmount;
  
  if (customTipAmount && customTipAmount > 0) {
    totalTipAmount = customTipAmount;
  } else {
    totalTipAmount = (totalServiceAmount * tipPercentage) / 100;
  }

  // Calculate each staff member's share based on their service price percentage
  const staffTipDistribution = appointments.map(appointment => {
    const staffShare = totalServiceAmount > 0 ? appointment.servicePrice / totalServiceAmount : 1 / appointments.length;
    const staffTipAmount = totalTipAmount * staffShare;
    
    return {
      staffId: appointment.staffId,
      staffName: appointment.staffName,
      staffEmail: appointment.staffEmail,
      serviceName: appointment.serviceName,
      servicePrice: appointment.servicePrice,
      sharePercentage: Math.round(staffShare * 100 * 100) / 100, // Round to 2 decimals
      tipAmount: Math.round(staffTipAmount * 100) / 100, // Round to 2 decimals
      totalEarning: appointment.servicePrice + Math.round(staffTipAmount * 100) / 100
    };
  });

  return {
    totalTipAmount: Math.round(totalTipAmount * 100) / 100,
    tipMethod: customTipAmount ? 'custom' : `${tipPercentage}%`,
    staffTipDistribution: staffTipDistribution
  };
}

// Helper function to calculate taxes (Canadian GST/HST)
function calculateTaxes(subtotal, locationId) {
  // Default Canadian tax rates (you can customize by province)
  const taxRates = {
    gst: 5,      // Federal GST
    pst: 7,      // Provincial (varies by province - using BC as example)
    hst: 0       // Harmonized (some provinces use HST instead of GST+PST)
  };

  const gstAmount = (subtotal * taxRates.gst) / 100;
  const pstAmount = (subtotal * taxRates.pst) / 100;
  const totalTax = gstAmount + pstAmount;

  return {
    gst: {
      rate: taxRates.gst,
      amount: Math.round(gstAmount * 100) / 100
    },
    pst: {
      rate: taxRates.pst,
      amount: Math.round(pstAmount * 100) / 100
    },
    totalTax: Math.round(totalTax * 100) / 100,
    taxableAmount: subtotal
  };
}

// Helper function to create LeadConnector payment line items
function createPaymentLineItems(appointments, tipCalculation, taxes) {
  const lineItems = [];

  // Add service line items
  appointments.forEach((appointment, index) => {
    lineItems.push({
      name: appointment.serviceName,
      description: `${appointment.serviceName} with ${appointment.staffName}`,
      amount: appointment.servicePrice * 100, // Convert to cents
      quantity: 1,
      metadata: {
        type: 'service',
        calendarId: appointment.calendarId,
        staffId: appointment.staffId,
        appointmentId: appointment.appointmentId
      }
    });
  });

  // Add tip line item
  if (tipCalculation.totalTipAmount > 0) {
    lineItems.push({
      name: 'Staff Tip',
      description: `${tipCalculation.tipMethod} tip for excellent service`,
      amount: tipCalculation.totalTipAmount * 100, // Convert to cents
      quantity: 1,
      metadata: {
        type: 'tip',
        tipMethod: tipCalculation.tipMethod,
        staffCount: tipCalculation.staffTipDistribution.length
      }
    });
  }

  // Add tax line items
  if (taxes.gst.amount > 0) {
    lineItems.push({
      name: 'GST',
      description: `Goods and Services Tax (${taxes.gst.rate}%)`,
      amount: taxes.gst.amount * 100, // Convert to cents
      quantity: 1,
      metadata: {
        type: 'tax',
        taxType: 'gst'
      }
    });
  }

  if (taxes.pst.amount > 0) {
    lineItems.push({
      name: 'PST',
      description: `Provincial Sales Tax (${taxes.pst.rate}%)`,
      amount: taxes.pst.amount * 100, // Convert to cents
      quantity: 1,
      metadata: {
        type: 'tax',
        taxType: 'pst'
      }
    });
  }

  return lineItems;
}
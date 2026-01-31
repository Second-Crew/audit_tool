import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request) {
  try {
    const { url, companyName, industry, city } = await request.json();

    if (!url || !companyName || !industry || !city) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Normalize URL
    let normalizedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      normalizedUrl = 'https://' + url;
    }

    // Run all analyses in parallel
    const [pageSpeedMobile, pageSpeedDesktop, websiteData] = await Promise.all([
      getPageSpeedData(normalizedUrl, 'mobile'),
      getPageSpeedData(normalizedUrl, 'desktop'),
      scrapeWebsiteData(normalizedUrl),
    ]);

    // Calculate scores
    const mobileScore = Math.round((pageSpeedMobile?.lighthouseResult?.categories?.performance?.score || 0) * 100);
    const desktopScore = Math.round((pageSpeedDesktop?.lighthouseResult?.categories?.performance?.score || 0) * 100);

    // AI Readiness Analysis
    const aiReadiness = analyzeAIReadiness(websiteData);

    // AEO/GEO Analysis - Check if site is optimized for LLMs
    const aeoGeoAnalysis = analyzeAEOGEO(websiteData, industry, city, companyName);

    // SEO Analysis
    const seoAnalysis = analyzeSEO(websiteData, pageSpeedMobile);

    // Security Analysis
    const securityAnalysis = analyzeSecurityHeaders(normalizedUrl, websiteData);

    // Accessibility Analysis
    const accessibilityAnalysis = analyzeAccessibility(websiteData, pageSpeedMobile);

    // Extract performance metrics
    const performanceMetrics = extractPerformanceMetrics(pageSpeedMobile);

    // Generate AI insights using Gemini
    const aiInsights = await generateAIInsights({
      companyName,
      industry,
      city,
      url: normalizedUrl,
      mobileScore,
      desktopScore,
      aiReadiness,
      aeoGeoAnalysis,
      seoAnalysis,
      accessibilityAnalysis,
      performanceMetrics,
    });

    // Calculate overall scores
    const scores = {
      mobile: mobileScore,
      desktop: desktopScore,
      aiReadiness: aiReadiness.score,
      seo: seoAnalysis.score,
      aeoGeo: aeoGeoAnalysis.score,
      security: securityAnalysis.score,
      accessibility: accessibilityAnalysis.score,
    };

    // Generate HTML report
    const html = generateReportHTML({
      companyName,
      industry,
      city,
      url: normalizedUrl,
      scores,
      performanceMetrics,
      aiReadiness,
      aeoGeoAnalysis,
      seoAnalysis,
      securityAnalysis,
      accessibilityAnalysis,
      aiInsights,
    });

    return NextResponse.json({
      success: true,
      scores,
      aiReadiness,
      aeoGeoAnalysis,
      seoAnalysis,
      accessibilityAnalysis,
      performanceMetrics,
      aiInsights,
      html,
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze website' },
      { status: 500 }
    );
  }
}

// Fetch PageSpeed data from Google API
async function getPageSpeedData(url, strategy) {
  try {
    // Use API key if available for higher rate limits
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || '';
    const keyParam = apiKey ? `&key=${apiKey}` : '';
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=accessibility&category=seo${keyParam}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`PageSpeed ${strategy} API error:`, response.status, errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`PageSpeed ${strategy} error:`, error);
    return null;
  }
}

// Scrape website for analysis
async function scrapeWebsiteData(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SecondCrewBot/1.0; +https://secondcrew.com)',
      },
    });

    const html = await response.text();
    const headers = Object.fromEntries(response.headers.entries());

    // Parse HTML for key elements
    const data = {
      html,
      headers,
      hasHttps: url.startsWith('https://'),
      // Check for chatbot indicators
      hasChatbot: checkForChatbot(html),
      // Check for AI/voice agent indicators
      hasVoiceAgent: checkForVoiceAgent(html),
      // Check for calculator/quote tools
      hasCalculator: checkForCalculator(html),
      // Check for schema markup
      schemaMarkup: extractSchemaMarkup(html),
      // Check for meta tags
      metaTags: extractMetaTags(html),
      // Check for headings structure
      headings: extractHeadings(html),
      // Check for FAQ content
      hasFAQ: checkForFAQ(html),
      // Check for local business info
      localBusinessInfo: extractLocalBusinessInfo(html),
      // Check for reviews/testimonials
      hasReviews: checkForReviews(html),
      // Check for contact info visibility
      contactInfo: extractContactInfo(html),
      // AEO/GEO specific checks
      aeoIndicators: checkAEOIndicators(html),
    };

    return data;
  } catch (error) {
    console.error('Scrape error:', error);
    return { error: error.message };
  }
}

// Check for chatbot presence - ACCURATE detection via scripts/widgets only
function checkForChatbot(html) {
  const detected = [];

  // Intercom - look for actual widget script
  if (/intercom\.com\/widget|window\.Intercom|intercomSettings/i.test(html)) {
    detected.push('Intercom');
  }

  // Drift - look for actual widget
  if (/drift\.com|js\.driftt\.com|window\.drift|drift\s*=\s*window\.drift/i.test(html)) {
    detected.push('Drift');
  }

  // HubSpot Chat - look for actual widget
  if (/js\.hs-scripts\.com|hs-script-loader|hubspot.*conversations|HubSpotConversations/i.test(html)) {
    detected.push('HubSpot Chat');
  }

  // Zendesk Chat - look for actual widget
  if (/static\.zdassets\.com|zopim|zendesk.*chat|zE\s*\(|zESettings/i.test(html)) {
    detected.push('Zendesk Chat');
  }

  // LiveChat - look for actual widget
  if (/cdn\.livechatinc\.com|__lc\s*=|livechatinc\.com\/tracking/i.test(html)) {
    detected.push('LiveChat');
  }

  // Tidio - look for actual widget
  if (/code\.tidio\.co|tidioChatCode|tidio_chat/i.test(html)) {
    detected.push('Tidio');
  }

  // Crisp - look for actual widget
  if (/client\.crisp\.chat|window\.\$crisp|CRISP_WEBSITE_ID/i.test(html)) {
    detected.push('Crisp');
  }

  // Freshchat/Freshdesk - look for actual widget
  if (/wchat\.freshchat\.com|freshchat\.min\.js|fcWidget/i.test(html)) {
    detected.push('Freshchat');
  }

  // Tawk.to - look for actual widget
  if (/embed\.tawk\.to|Tawk_API|tawk\.to/i.test(html)) {
    detected.push('Tawk.to');
  }

  // Olark - look for actual widget
  if (/static\.olark\.com|olark\.identify|olark\s*\(/i.test(html)) {
    detected.push('Olark');
  }

  // Chatra - look for actual widget
  if (/call\.chatra\.io|ChatraID|window\.ChatraSetup/i.test(html)) {
    detected.push('Chatra');
  }

  // JivoChat - look for actual widget
  if (/code\.jivosite\.com|jivo_api|jivosite/i.test(html)) {
    detected.push('JivoChat');
  }

  // Smartsupp - look for actual widget
  if (/smartsupp\.com\/loader|smartsupp\s*\(|_smartsupp/i.test(html)) {
    detected.push('Smartsupp');
  }

  // Zoho SalesIQ - look for actual widget
  if (/salesiq\.zoho\.com|zoho.*salesiq|\$zoho.*salesiq/i.test(html)) {
    detected.push('Zoho SalesIQ');
  }

  // Facebook Messenger - look for actual widget
  if (/connect\.facebook\.net.*customerchat|fb-customerchat|MessengerExtensions/i.test(html)) {
    detected.push('Facebook Messenger');
  }

  // Chatbot.com - look for actual widget
  if (/cdn\.chatbot\.com|chatbot\.com\/widget/i.test(html)) {
    detected.push('Chatbot.com');
  }

  // Voiceflow - look for actual widget
  if (/cdn\.voiceflow\.com|voiceflow.*widget/i.test(html)) {
    detected.push('Voiceflow');
  }

  // Botpress - look for actual widget
  if (/cdn\.botpress\.cloud|botpress.*webchat/i.test(html)) {
    detected.push('Botpress');
  }

  // Landbot - look for actual widget
  if (/cdn\.landbot\.io|landbot.*widget/i.test(html)) {
    detected.push('Landbot');
  }

  return {
    detected: detected.length > 0,
    providers: detected,
    confidence: detected.length > 0 ? 'high' : 'none',
  };
}

// Check for voice agent presence - ACCURATE detection via scripts/widgets only
function checkForVoiceAgent(html) {
  const detected = [];

  // Vapi.ai - AI voice agent
  if (/vapi\.ai|cdn\.vapi\.ai|vapiSDK|vapi-widget/i.test(html)) {
    detected.push('Vapi.ai');
  }

  // Bland.ai - AI phone agent
  if (/bland\.ai|api\.bland\.ai|bland-widget/i.test(html)) {
    detected.push('Bland.ai');
  }

  // Retell AI - voice agent
  if (/retell\.ai|retellai|retell-widget/i.test(html)) {
    detected.push('Retell AI');
  }

  // Synthflow - AI voice
  if (/synthflow\.ai|synthflow-widget/i.test(html)) {
    detected.push('Synthflow');
  }

  // Vocode - voice AI
  if (/vocode\.dev|vocode-widget/i.test(html)) {
    detected.push('Vocode');
  }

  // PlayHT - voice AI
  if (/play\.ht|playht.*widget/i.test(html)) {
    detected.push('PlayHT');
  }

  // ElevenLabs widget
  if (/elevenlabs\.io|elevenlabs-widget|elevenlabs-convai/i.test(html)) {
    detected.push('ElevenLabs');
  }

  // Air AI
  if (/air\.ai|airai-widget/i.test(html)) {
    detected.push('Air AI');
  }

  // Note: Traditional phone systems like Aircall, RingCentral, Dialpad are NOT AI voice agents
  // They are VoIP/call tracking - different from AI that answers calls

  return {
    detected: detected.length > 0,
    providers: detected,
    confidence: detected.length > 0 ? 'high' : 'none',
  };
}

// Check for calculator/quote tools - look for actual interactive elements
function checkForCalculator(html) {
  const detected = [];
  const htmlLower = html.toLowerCase();

  // Look for actual calculator widgets/tools (not just mentions)
  // Check for calculator-specific form patterns with input fields and calculate buttons
  const hasCalcForm = /<form[^>]*(?:calculator|quote|estimate|pricing)[^>]*>[\s\S]*?<input[\s\S]*?<\/form>/i.test(html);
  const hasCalcWidget = /class=["'][^"']*(?:calculator-widget|quote-calculator|price-calculator|cost-calculator|roi-calculator)[^"']*["']/i.test(html);
  const hasCalcScript = /(?:calculator|calcWidget|quoteCalculator|pricingCalculator)\.(?:js|min\.js)/i.test(html);

  // Known calculator platforms
  if (/calconic\.com|outgrow\.co|calculoid\.com|ucalc\.pro/i.test(html)) {
    detected.push('Third-party Calculator Tool');
  }

  // Check for interactive pricing/quote elements
  if (/id=["'][^"']*(?:calculator|quote-form|pricing-calculator|cost-estimate)[^"']*["']/i.test(html)) {
    detected.push('Custom Calculator');
  }

  // Typeform/form tools often used for quotes
  if (/typeform\.com|jotform\.com.*(?:quote|estimate|calculator)/i.test(html)) {
    detected.push('Interactive Quote Form');
  }

  if (hasCalcForm || hasCalcWidget || hasCalcScript) {
    if (detected.length === 0) detected.push('Calculator/Quote Tool');
  }

  return {
    detected: detected.length > 0,
    types: detected,
    confidence: detected.length > 0 ? 'medium' : 'none',
  };
}

// Extract schema markup
function extractSchemaMarkup(html) {
  const schemas = [];

  // Check for JSON-LD
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    jsonLdMatches.forEach(match => {
      try {
        const content = match.replace(/<script[^>]*>|<\/script>/gi, '');
        const parsed = JSON.parse(content);
        schemas.push({
          type: 'JSON-LD',
          schemaType: parsed['@type'] || 'Unknown',
          data: parsed,
        });
      } catch (e) {
        // Invalid JSON
      }
    });
  }

  // Check for common schema types
  const hasLocalBusiness = schemas.some(s =>
    s.schemaType === 'LocalBusiness' ||
    s.schemaType === 'Organization' ||
    s.schemaType === 'ProfessionalService'
  );

  const hasFAQSchema = schemas.some(s => s.schemaType === 'FAQPage');
  const hasReviewSchema = schemas.some(s =>
    s.schemaType === 'Review' ||
    s.schemaType === 'AggregateRating'
  );
  const hasServiceSchema = schemas.some(s =>
    s.schemaType === 'Service' ||
    s.schemaType === 'Product'
  );

  return {
    found: schemas.length > 0,
    count: schemas.length,
    schemas,
    hasLocalBusiness,
    hasFAQSchema,
    hasReviewSchema,
    hasServiceSchema,
  };
}

// Extract meta tags
function extractMetaTags(html) {
  const tags = {};

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  tags.title = titleMatch ? titleMatch[1].trim() : null;

  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  tags.description = descMatch ? descMatch[1].trim() : null;

  // Open Graph
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  tags.ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : null;

  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
  tags.ogDescription = ogDescMatch ? ogDescMatch[1].trim() : null;

  // Canonical
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  tags.canonical = canonicalMatch ? canonicalMatch[1].trim() : null;

  // Robots
  const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i);
  tags.robots = robotsMatch ? robotsMatch[1].trim() : null;

  return tags;
}

// Extract headings
function extractHeadings(html) {
  const headings = { h1: [], h2: [], h3: [] };

  const h1Matches = html.match(/<h1[^>]*>([^<]*)<\/h1>/gi) || [];
  headings.h1 = h1Matches.map(h => h.replace(/<[^>]*>/g, '').trim()).filter(Boolean);

  const h2Matches = html.match(/<h2[^>]*>([^<]*)<\/h2>/gi) || [];
  headings.h2 = h2Matches.map(h => h.replace(/<[^>]*>/g, '').trim()).filter(Boolean);

  const h3Matches = html.match(/<h3[^>]*>([^<]*)<\/h3>/gi) || [];
  headings.h3 = h3Matches.map(h => h.replace(/<[^>]*>/g, '').trim()).filter(Boolean);

  return headings;
}

// Check for FAQ content
function checkForFAQ(html) {
  const htmlLower = html.toLowerCase();
  const indicators = [
    'faq', 'frequently asked', 'common questions',
    'questions and answers', 'q&a', 'help center',
  ];

  return indicators.some(ind => htmlLower.includes(ind));
}

// Extract local business info
function extractLocalBusinessInfo(html) {
  const info = {};

  // Phone number patterns
  const phoneMatch = html.match(/(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  info.phone = phoneMatch ? phoneMatch[1] : null;

  // Address patterns (simplified)
  const hasAddress = html.toLowerCase().includes('address') ||
    /\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd)/i.test(html);
  info.hasAddress = hasAddress;

  // Hours
  info.hasHours = html.toLowerCase().includes('hours') ||
    html.toLowerCase().includes('open') ||
    html.toLowerCase().includes('schedule');

  return info;
}

// Check for reviews/testimonials
function checkForReviews(html) {
  const htmlLower = html.toLowerCase();
  const indicators = [
    'testimonial', 'review', 'rating', 'stars', 'customer-feedback',
    'what our clients say', 'google-reviews', 'yelp', 'trust-pilot',
  ];

  return {
    detected: indicators.some(ind => htmlLower.includes(ind)),
    hasStarRating: html.includes('★') || htmlLower.includes('star-rating'),
  };
}

// Extract contact info
function extractContactInfo(html) {
  return {
    hasPhoneInHeader: /<header[^>]*>[\s\S]*?(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})[\s\S]*?<\/header>/i.test(html),
    hasClickToCall: /href=["']tel:/i.test(html),
    hasContactForm: /<form[\s\S]*?(contact|inquiry|message)[\s\S]*?<\/form>/i.test(html),
    hasEmail: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(html),
  };
}

// AEO (Answer Engine Optimization) / GEO (Generative Engine Optimization) checks
function checkAEOIndicators(html) {
  const htmlLower = html.toLowerCase();

  return {
    // Clear, direct answers that LLMs can extract
    hasDefinitiveStatements: /we (are|specialize|provide|offer|help)/i.test(html),

    // Question-answer format that LLMs love
    hasQAFormat: /<(dt|dd)|class=["'][^"']*faq|question.*answer/i.test(html),

    // Structured lists that LLMs can parse
    hasStructuredLists: /<(ul|ol)[^>]*>[\s\S]*?<li/i.test(html),

    // Clear service descriptions
    hasServiceDescriptions: /our services|what we (do|offer)|how we help/i.test(htmlLower),

    // Geographic targeting
    hasLocalKeywords: /serving|located in|based in|near|local/i.test(htmlLower),

    // Expertise indicators that build E-E-A-T
    hasExpertiseIndicators: /years of experience|certified|licensed|award|expert|specialist/i.test(htmlLower),

    // Process/methodology descriptions
    hasProcessDescription: /our process|how (it|we) work|step[s]?|approach/i.test(htmlLower),

    // Comparison content
    hasComparisonContent: /vs|versus|compared to|difference between|why choose/i.test(htmlLower),

    // Statistics and data points
    hasStatistics: /\d+%|\d+ (years|clients|projects|customers)/i.test(html),

    // Author/expert attribution
    hasAuthorAttribution: /written by|author|expert|founder|ceo|owner/i.test(htmlLower),
  };
}

// Analyze AI Readiness
function analyzeAIReadiness(data) {
  if (data.error) {
    return { score: 0, features: {}, issues: ['Could not analyze website'] };
  }

  let score = 0;
  const features = {
    chatbot: data.hasChatbot,
    voiceAgent: data.hasVoiceAgent,
    calculator: data.hasCalculator,
  };

  const issues = [];
  const opportunities = [];

  // Chatbot (30 points)
  if (features.chatbot.detected) {
    score += 30;
  } else {
    issues.push('No AI chatbot detected - missing 24/7 lead qualification');
    opportunities.push('Add an AI chatbot to capture and qualify leads around the clock');
  }

  // Voice Agent (25 points)
  if (features.voiceAgent.detected) {
    score += 25;
  } else {
    issues.push('No AI voice agent detected - after-hours calls go unanswered');
    opportunities.push('Implement AI voice agent to never miss a call');
  }

  // Calculator/Quote Tool (25 points)
  if (features.calculator.detected) {
    score += 25;
  } else {
    issues.push('No instant quote/calculator tool - visitors want immediate answers');
    opportunities.push('Add an AI-powered quote calculator for instant estimates');
  }

  // Schema for AI understanding (20 points)
  if (data.schemaMarkup?.found) {
    score += 10;
    if (data.schemaMarkup.hasLocalBusiness) score += 5;
    if (data.schemaMarkup.hasFAQSchema) score += 5;
  } else {
    issues.push('No schema markup - AI assistants struggle to understand your business');
  }

  return {
    score: Math.min(score, 100),
    features,
    issues,
    opportunities,
  };
}

// Analyze AEO/GEO (LLM optimization) - DETAILED breakdown for customer explanation
function analyzeAEOGEO(data, industry, city, companyName) {
  if (data.error) {
    return { score: 0, issues: [], recommendations: [], detailedChecks: [] };
  }

  let score = 0;
  const issues = [];
  const recommendations = [];
  const detailedChecks = []; // New: detailed breakdown for report
  const checks = {
    schemaMarkup: false,
    faqContent: false,
    localSignals: false,
    clearAnswers: false,
    expertiseSignals: false,
    structuredContent: false,
  };

  const aeo = data.aeoIndicators || {};

  // Schema Markup (20 points)
  const schemaCheck = {
    name: 'Schema Markup (Structured Data)',
    status: 'missing',
    score: 0,
    maxScore: 20,
    details: [],
    whyItMatters: 'Schema markup helps AI assistants like ChatGPT and Google understand your business type, services, location, and reviews in a structured way.',
    recommendation: '',
  };

  if (data.schemaMarkup?.found) {
    schemaCheck.score = 10;
    schemaCheck.status = 'partial';
    schemaCheck.details.push(`Found ${data.schemaMarkup.count} schema type(s)`);
    checks.schemaMarkup = true;

    if (data.schemaMarkup.hasLocalBusiness) {
      schemaCheck.score += 5;
      schemaCheck.details.push('✓ LocalBusiness schema found');
    } else {
      schemaCheck.details.push('✗ Missing LocalBusiness schema');
      schemaCheck.recommendation = 'Add LocalBusiness schema with your address, phone, hours, and service area.';
    }

    if (data.schemaMarkup.hasFAQSchema) {
      schemaCheck.score += 5;
      schemaCheck.details.push('✓ FAQ schema found');
      schemaCheck.status = 'good';
    } else {
      schemaCheck.details.push('✗ Missing FAQPage schema');
      if (!schemaCheck.recommendation) {
        schemaCheck.recommendation = 'Add FAQ schema to help AI extract your Q&A content.';
      }
    }

    if (data.schemaMarkup.hasReviewSchema) {
      schemaCheck.details.push('✓ Review/Rating schema found');
    }
    if (data.schemaMarkup.hasServiceSchema) {
      schemaCheck.details.push('✓ Service schema found');
    }
  } else {
    schemaCheck.status = 'missing';
    schemaCheck.details.push('No schema markup detected on the page');
    schemaCheck.recommendation = `Add LocalBusiness, FAQPage, and Service schema markup. This is critical for AI assistants to recommend ${companyName} for "${industry} in ${city}" queries.`;
    issues.push('No structured data/schema markup - LLMs cannot easily parse your business info');
    recommendations.push('Add LocalBusiness and FAQPage schema markup');
  }
  score += schemaCheck.score;
  detailedChecks.push(schemaCheck);

  // FAQ Content (15 points)
  const faqCheck = {
    name: 'FAQ Content',
    status: 'missing',
    score: 0,
    maxScore: 15,
    details: [],
    whyItMatters: 'FAQs are goldmines for AI. When someone asks ChatGPT a question about your industry, sites with clear Q&A content get cited and recommended.',
    recommendation: '',
  };

  if (data.hasFAQ || data.schemaMarkup?.hasFAQSchema) {
    faqCheck.score = 15;
    faqCheck.status = 'good';
    faqCheck.details.push('✓ FAQ content detected on the page');
    if (data.schemaMarkup?.hasFAQSchema) {
      faqCheck.details.push('✓ FAQ schema markup present');
    } else {
      faqCheck.details.push('✗ FAQ content found but no FAQ schema markup');
      faqCheck.recommendation = 'Add FAQPage schema to your existing FAQ content for better AI visibility.';
      faqCheck.status = 'partial';
      faqCheck.score = 10;
    }
    checks.faqContent = true;
  } else {
    faqCheck.status = 'missing';
    faqCheck.details.push('No FAQ section detected');
    faqCheck.recommendation = `Create an FAQ page answering common ${industry} questions like: "How much does [service] cost?", "How long does [service] take?", "Do you serve [${city}]?", "What is your process?"`;
    issues.push('No FAQ content - missing opportunity for LLMs to extract Q&A');
    recommendations.push(`Create FAQ section answering common ${industry} questions`);
  }
  score += faqCheck.score;
  detailedChecks.push(faqCheck);

  // Local Business Signals (15 points)
  const localCheck = {
    name: 'Local Business Signals',
    status: 'missing',
    score: 0,
    maxScore: 15,
    details: [],
    whyItMatters: `When someone asks AI "Who is the best ${industry.toLowerCase()} in ${city}?", the AI looks for clear location signals to make local recommendations.`,
    recommendation: '',
  };

  if (data.localBusinessInfo?.phone) {
    localCheck.score += 5;
    localCheck.details.push('✓ Phone number visible');
  } else {
    localCheck.details.push('✗ Phone number not prominently displayed');
  }

  if (data.localBusinessInfo?.hasAddress) {
    localCheck.score += 5;
    localCheck.details.push('✓ Address information found');
  } else {
    localCheck.details.push('✗ No clear address/location information');
  }

  if (data.localBusinessInfo?.hasHours) {
    localCheck.score += 5;
    localCheck.details.push('✓ Business hours mentioned');
  } else {
    localCheck.details.push('✗ Business hours not displayed');
  }

  if (localCheck.score >= 10) {
    localCheck.status = localCheck.score === 15 ? 'good' : 'partial';
    checks.localSignals = true;
  } else {
    localCheck.status = 'missing';
    issues.push('Weak local signals - LLMs may not recommend you for local searches');
    recommendations.push(`Prominently display ${city} address, phone, and business hours`);
  }

  if (localCheck.score < 15) {
    localCheck.recommendation = `Add a clear footer or contact section with your full ${city} address, phone number (with click-to-call), and business hours. This helps AI recommend you for local queries.`;
  }
  score += localCheck.score;
  detailedChecks.push(localCheck);

  // Clear, Extractable Answers (20 points)
  const answersCheck = {
    name: 'Clear, Extractable Content',
    status: 'missing',
    score: 0,
    maxScore: 20,
    details: [],
    whyItMatters: 'AI assistants extract direct statements from websites. Content like "We are a [industry] company serving [city]" and "Our services include..." gets pulled directly into AI responses.',
    recommendation: '',
  };

  if (aeo.hasDefinitiveStatements) {
    answersCheck.score += 8;
    answersCheck.details.push('✓ Clear "We are/We provide/We specialize" statements found');
  } else {
    answersCheck.details.push('✗ Missing clear definitive statements about your business');
  }

  if (aeo.hasServiceDescriptions) {
    answersCheck.score += 7;
    answersCheck.details.push('✓ Service descriptions found');
    checks.clearAnswers = true;
  } else {
    answersCheck.details.push('✗ No clear service descriptions');
  }

  if (aeo.hasProcessDescription) {
    answersCheck.score += 5;
    answersCheck.details.push('✓ Process/methodology described');
  } else {
    answersCheck.details.push('✗ No process or "how we work" description');
  }

  answersCheck.status = answersCheck.score >= 15 ? 'good' : answersCheck.score >= 8 ? 'partial' : 'missing';

  if (answersCheck.score < 20) {
    answersCheck.recommendation = `Add clear statements like: "${companyName} is a ${industry.toLowerCase()} company serving ${city} and surrounding areas. We specialize in [services]. Our process includes: 1) [step], 2) [step], 3) [step]."`;
    if (answersCheck.score < 8) {
      issues.push('Content lacks clear, direct statements LLMs can extract');
      recommendations.push('Write clear "We are...", "We specialize in...", "Our process is..." statements');
    }
  }
  score += answersCheck.score;
  detailedChecks.push(answersCheck);

  // Expertise/E-E-A-T Signals (15 points)
  const expertiseCheck = {
    name: 'Expertise & Trust Signals (E-E-A-T)',
    status: 'missing',
    score: 0,
    maxScore: 15,
    details: [],
    whyItMatters: 'Google and AI systems prioritize content from experts. Showing credentials, experience, and real data builds trust with both AI and potential customers.',
    recommendation: '',
  };

  if (aeo.hasExpertiseIndicators) {
    expertiseCheck.score += 10;
    expertiseCheck.details.push('✓ Expertise indicators found (years, certifications, etc.)');
    checks.expertiseSignals = true;
  } else {
    expertiseCheck.details.push('✗ No expertise credentials visible');
  }

  if (aeo.hasStatistics) {
    expertiseCheck.score += 5;
    expertiseCheck.details.push('✓ Statistics/numbers found (projects completed, years, etc.)');
  } else {
    expertiseCheck.details.push('✗ No statistics or concrete numbers');
  }

  if (aeo.hasAuthorAttribution) {
    expertiseCheck.details.push('✓ Author/expert attribution found');
  }

  if (data.hasReviews?.detected) {
    expertiseCheck.details.push('✓ Reviews/testimonials section found');
  } else {
    expertiseCheck.details.push('✗ No reviews or testimonials visible');
  }

  expertiseCheck.status = expertiseCheck.score >= 10 ? 'good' : expertiseCheck.score >= 5 ? 'partial' : 'missing';

  if (expertiseCheck.score < 15) {
    expertiseCheck.recommendation = `Add credibility signals: "Serving ${city} for X years", "X+ projects completed", "Licensed & Insured", "5-star rated on Google". Include customer testimonials with names and specific results.`;
    if (expertiseCheck.score < 10) {
      issues.push('Missing expertise indicators that build LLM trust');
      recommendations.push('Add credentials, years of experience, certifications, and client statistics');
    }
  }
  score += expertiseCheck.score;
  detailedChecks.push(expertiseCheck);

  // Structured Content (15 points)
  const structureCheck = {
    name: 'Structured Content Format',
    status: 'missing',
    score: 0,
    maxScore: 15,
    details: [],
    whyItMatters: 'AI systems parse bullet points, numbered lists, and clear headings more easily than dense paragraphs. Structured content gets extracted and cited more often.',
    recommendation: '',
  };

  if (aeo.hasStructuredLists) {
    structureCheck.score += 8;
    structureCheck.details.push('✓ Structured lists (bullet points/numbered) found');
  } else {
    structureCheck.details.push('✗ No structured lists detected');
  }

  if (aeo.hasQAFormat) {
    structureCheck.score += 7;
    structureCheck.details.push('✓ Q&A format content found');
    checks.structuredContent = true;
  } else {
    structureCheck.details.push('✗ No Q&A format content');
  }

  if (aeo.hasComparisonContent) {
    structureCheck.details.push('✓ Comparison content found (vs, compared to)');
  }

  structureCheck.status = structureCheck.score >= 12 ? 'good' : structureCheck.score >= 5 ? 'partial' : 'missing';

  if (structureCheck.score < 15) {
    structureCheck.recommendation = 'Format your content with: bullet point lists for services, numbered steps for processes, Q&A sections, and comparison tables. AI loves to extract and cite well-structured content.';
    if (structureCheck.score < 8) {
      issues.push('Content not structured for LLM parsing');
      recommendations.push('Use bullet points, numbered lists, and clear headings');
    }
  }
  score += structureCheck.score;
  detailedChecks.push(structureCheck);

  // LLM Recommendation Test Context
  const llmContext = {
    wouldRecommend: score >= 60,
    reasoning: score >= 60
      ? `Site has sufficient signals for LLMs to understand and recommend ${companyName}`
      : `LLMs like ChatGPT may struggle to recommend ${companyName} for "${industry} in ${city}" queries`,
    testQuery: `"Best ${industry.toLowerCase()} in ${city}"`,
    prediction: score >= 70
      ? `HIGH likelihood of being recommended - strong AI signals`
      : score >= 50
        ? `MEDIUM likelihood - some improvements needed`
        : `LOW likelihood - significant improvements needed for AI visibility`,
  };

  return {
    score: Math.min(score, 100),
    checks,
    issues,
    recommendations,
    llmContext,
    detailedChecks, // NEW: detailed breakdown for customer explanation
  };
}

// Analyze SEO
function analyzeSEO(data, pageSpeedData) {
  if (data.error) {
    return { score: 0, issues: [] };
  }

  let score = 0;
  const issues = [];
  const checks = {};

  // Title tag (15 points)
  if (data.metaTags?.title) {
    score += 10;
    checks.title = true;
    if (data.metaTags.title.length >= 30 && data.metaTags.title.length <= 60) {
      score += 5;
    }
  } else {
    issues.push('Missing title tag');
    checks.title = false;
  }

  // Meta description (15 points)
  if (data.metaTags?.description) {
    score += 10;
    checks.description = true;
    if (data.metaTags.description.length >= 120 && data.metaTags.description.length <= 160) {
      score += 5;
    }
  } else {
    issues.push('Missing meta description');
    checks.description = false;
  }

  // H1 tag (15 points)
  if (data.headings?.h1?.length === 1) {
    score += 15;
    checks.h1 = true;
  } else if (data.headings?.h1?.length > 1) {
    score += 5;
    issues.push('Multiple H1 tags found (should have exactly one)');
    checks.h1 = false;
  } else {
    issues.push('Missing H1 tag');
    checks.h1 = false;
  }

  // Schema markup (15 points)
  if (data.schemaMarkup?.found) {
    score += 15;
    checks.schema = true;
  } else {
    issues.push('No schema markup detected');
    checks.schema = false;
  }

  // HTTPS (10 points)
  if (data.hasHttps) {
    score += 10;
    checks.https = true;
  } else {
    issues.push('Site not using HTTPS');
    checks.https = false;
  }

  // Canonical URL (10 points)
  if (data.metaTags?.canonical) {
    score += 10;
    checks.canonical = true;
  } else {
    issues.push('Missing canonical URL');
    checks.canonical = false;
  }

  // Mobile friendly from PageSpeed (10 points)
  const mobileScore = pageSpeedData?.lighthouseResult?.categories?.performance?.score || 0;
  if (mobileScore >= 0.5) {
    score += 10;
    checks.mobile = true;
  } else {
    issues.push('Poor mobile performance');
    checks.mobile = false;
  }

  // Open Graph (10 points)
  if (data.metaTags?.ogTitle && data.metaTags?.ogDescription) {
    score += 10;
    checks.openGraph = true;
  } else {
    issues.push('Missing Open Graph tags');
    checks.openGraph = false;
  }

  return {
    score: Math.min(score, 100),
    checks,
    issues,
    metaTags: data.metaTags,
  };
}

// Analyze security headers
function analyzeSecurityHeaders(url, data) {
  let score = 0;
  const issues = [];

  // HTTPS (40 points)
  if (url.startsWith('https://')) {
    score += 40;
  } else {
    issues.push('Not using HTTPS - security risk');
  }

  // Check headers if available
  if (data.headers) {
    // Strict-Transport-Security (15 points)
    if (data.headers['strict-transport-security']) {
      score += 15;
    } else {
      issues.push('Missing HSTS header');
    }

    // X-Content-Type-Options (15 points)
    if (data.headers['x-content-type-options']) {
      score += 15;
    }

    // X-Frame-Options or CSP frame-ancestors (15 points)
    if (data.headers['x-frame-options'] || data.headers['content-security-policy']?.includes('frame-ancestors')) {
      score += 15;
    }

    // Content-Security-Policy (15 points)
    if (data.headers['content-security-policy']) {
      score += 15;
    }
  } else {
    score += 30; // Give partial credit if we couldn't check headers
  }

  return {
    score: Math.min(score, 100),
    issues,
    hasHttps: url.startsWith('https://'),
  };
}

// Analyze accessibility
function analyzeAccessibility(data, pageSpeedData) {
  let score = 0;
  const issues = [];
  const checks = {};

  // Get Lighthouse accessibility score if available (40 points max)
  const lighthouseA11yScore = pageSpeedData?.lighthouseResult?.categories?.accessibility?.score;
  if (lighthouseA11yScore !== undefined) {
    score += Math.round(lighthouseA11yScore * 40);
    checks.lighthouseScore = Math.round(lighthouseA11yScore * 100);
  }

  if (data.error) {
    return { score: Math.max(score, 0), issues: ['Could not analyze website HTML'], checks };
  }

  const html = data.html || '';

  // Check for alt text on images (15 points)
  const imgTags = html.match(/<img[^>]*>/gi) || [];
  const imgsWithAlt = imgTags.filter(img => /alt\s*=\s*["'][^"']+["']/i.test(img));
  const altRatio = imgTags.length > 0 ? imgsWithAlt.length / imgTags.length : 1;

  if (altRatio >= 0.9) {
    score += 15;
    checks.altText = true;
  } else if (altRatio >= 0.5) {
    score += 8;
    checks.altText = false;
    issues.push(`${Math.round((1 - altRatio) * 100)}% of images missing alt text - screen readers cannot describe them`);
  } else {
    checks.altText = false;
    issues.push('Most images missing alt text - site not accessible to visually impaired users');
  }

  // Check for proper heading hierarchy (10 points)
  const hasH1 = /<h1[^>]*>/i.test(html);
  const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
  const hasProperHierarchy = hasH1 && h1Count === 1;

  if (hasProperHierarchy) {
    score += 10;
    checks.headingHierarchy = true;
  } else if (hasH1) {
    score += 5;
    checks.headingHierarchy = false;
    if (h1Count > 1) {
      issues.push('Multiple H1 headings found - confuses screen readers');
    }
  } else {
    checks.headingHierarchy = false;
    issues.push('No H1 heading found - page structure unclear for assistive technology');
  }

  // Check for form labels (10 points)
  const formInputs = html.match(/<input[^>]*type\s*=\s*["'](text|email|tel|password|search|number)["'][^>]*>/gi) || [];
  const hasLabels = /<label[^>]*>/i.test(html);
  const hasAriaLabels = /aria-label\s*=/i.test(html);

  if (formInputs.length === 0 || hasLabels || hasAriaLabels) {
    score += 10;
    checks.formLabels = true;
  } else {
    checks.formLabels = false;
    issues.push('Form inputs may lack proper labels - difficult for screen reader users');
  }

  // Check for skip navigation links (5 points)
  const hasSkipLink = /skip[- ]?(to[- ]?)?(main|content|nav)/i.test(html) ||
                      /#(main|content|maincontent)/i.test(html);
  if (hasSkipLink) {
    score += 5;
    checks.skipLinks = true;
  } else {
    checks.skipLinks = false;
    issues.push('No skip navigation link - keyboard users must tab through entire header');
  }

  // Check for ARIA landmarks (5 points)
  const hasLandmarks = /role\s*=\s*["'](main|navigation|banner|contentinfo|search)["']/i.test(html) ||
                       /<(main|nav|header|footer|aside)[^>]*>/i.test(html);
  if (hasLandmarks) {
    score += 5;
    checks.ariaLandmarks = true;
  } else {
    checks.ariaLandmarks = false;
    issues.push('Missing ARIA landmarks - assistive technology cannot navigate page sections');
  }

  // Check for sufficient color contrast indicators (5 points)
  // This is a heuristic - we check if there are very light text colors defined
  const hasLightText = /color\s*:\s*#[ef]{3,6}/i.test(html) ||
                       /color\s*:\s*rgb\s*\(\s*(2[3-5]\d|25[0-5])\s*,\s*(2[3-5]\d|25[0-5])\s*,\s*(2[3-5]\d|25[0-5])\s*\)/i.test(html);
  if (!hasLightText) {
    score += 5;
    checks.colorContrast = true;
  } else {
    checks.colorContrast = false;
    issues.push('Potential color contrast issues - may be difficult to read for low vision users');
  }

  // Check for focus indicators (5 points)
  const hasFocusStyles = /:focus/i.test(html) || /outline/i.test(html);
  if (hasFocusStyles) {
    score += 5;
    checks.focusIndicators = true;
  } else {
    checks.focusIndicators = false;
    issues.push('No visible focus indicators found - keyboard navigation unclear');
  }

  // Check for language attribute (5 points)
  const hasLangAttr = /<html[^>]*lang\s*=/i.test(html);
  if (hasLangAttr) {
    score += 5;
    checks.langAttribute = true;
  } else {
    checks.langAttribute = false;
    issues.push('Missing language attribute - screen readers may use wrong pronunciation');
  }

  return {
    score: Math.min(score, 100),
    issues,
    checks,
    lighthouseScore: checks.lighthouseScore || null,
  };
}

// Extract performance metrics
function extractPerformanceMetrics(pageSpeedData) {
  if (!pageSpeedData?.lighthouseResult?.audits) {
    return {
      firstContentfulPaint: 'N/A',
      largestContentfulPaint: 'N/A',
      totalBlockingTime: 'N/A',
      cumulativeLayoutShift: 'N/A',
      speedIndex: 'N/A',
      timeToInteractive: 'N/A',
    };
  }

  const audits = pageSpeedData.lighthouseResult.audits;

  return {
    firstContentfulPaint: audits['first-contentful-paint']?.displayValue || 'N/A',
    largestContentfulPaint: audits['largest-contentful-paint']?.displayValue || 'N/A',
    totalBlockingTime: audits['total-blocking-time']?.displayValue || 'N/A',
    cumulativeLayoutShift: audits['cumulative-layout-shift']?.displayValue || 'N/A',
    speedIndex: audits['speed-index']?.displayValue || 'N/A',
    timeToInteractive: audits['interactive']?.displayValue || 'N/A',
  };
}

// Generate AI insights using Gemini
async function generateAIInsights(data) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return getDefaultInsights(data);
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a website performance and AI readiness expert creating a FREE, value-first audit report. Generate helpful, actionable insights.

Business: ${data.companyName}
Industry: ${data.industry}
Location: ${data.city}
Website: ${data.url}

SCORES:
- Mobile Speed: ${data.mobileScore}/100
- Desktop Speed: ${data.desktopScore}/100
- AI Readiness: ${data.aiReadiness.score}/100
- AEO/GEO (LLM Optimization): ${data.aeoGeoAnalysis.score}/100
- SEO: ${data.seoAnalysis.score}/100

AI FEATURES DETECTED:
- Chatbot: ${data.aiReadiness.features.chatbot?.detected ? 'Yes' : 'No'}
- Voice Agent: ${data.aiReadiness.features.voiceAgent?.detected ? 'Yes' : 'No'}
- Quote Calculator: ${data.aiReadiness.features.calculator?.detected ? 'Yes' : 'No'}

LLM OPTIMIZATION ISSUES:
${data.aeoGeoAnalysis.issues.join('\n')}

Generate a JSON response with:
{
  "executiveSummary": "2-3 sentence summary of the website's performance and 2026 AI readiness",
  "topIssues": [
    {"title": "Issue title", "impact": "High/Medium", "description": "Plain English explanation of business impact"}
  ],
  "quickWins": [
    {"title": "Action item", "description": "How to do it", "timeEstimate": "X minutes"}
  ],
  "industryInsight": "One paragraph about why this matters specifically for ${data.industry} businesses in ${data.city} in 2026",
  "llmRecommendation": "What would happen if someone asked ChatGPT for a ${data.industry} recommendation in ${data.city} - would they find this business?"
}

Keep it friendly, helpful, and focused on business impact, not technical jargon. No sales pitch.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return getDefaultInsights(data);
  } catch (error) {
    console.error('Gemini error:', error);
    return getDefaultInsights(data);
  }
}

// Default insights if AI fails
function getDefaultInsights(data) {
  const issues = [];
  const quickWins = [];

  if (data.mobileScore < 50) {
    issues.push({
      title: 'Mobile Speed Needs Improvement',
      impact: 'High',
      description: '53% of mobile visitors leave if a page takes more than 3 seconds to load.',
    });
    quickWins.push({
      title: 'Compress Images',
      description: 'Use TinyPNG.com to compress images without losing quality.',
      timeEstimate: '15 minutes',
    });
  }

  if (!data.aiReadiness.features.chatbot?.detected) {
    issues.push({
      title: 'No 24/7 Lead Capture',
      impact: 'High',
      description: 'When visitors arrive after hours, they have no way to get immediate answers.',
    });
    quickWins.push({
      title: 'Add AI Chatbot',
      description: 'Install a chatbot like Tidio or Drift to qualify leads around the clock.',
      timeEstimate: '30 minutes',
    });
  }

  if (data.aeoGeoAnalysis.score < 50) {
    issues.push({
      title: 'Not Optimized for AI Search',
      impact: 'Medium',
      description: 'When people ask ChatGPT for recommendations, your business may not appear.',
    });
    quickWins.push({
      title: 'Add FAQ Schema',
      description: 'Create FAQ content with proper schema markup for LLM visibility.',
      timeEstimate: '45 minutes',
    });
  }

  return {
    executiveSummary: `${data.companyName}'s website has a mobile speed score of ${data.mobileScore}/100 and an AI readiness score of ${data.aiReadiness.score}/100. There are opportunities to improve lead capture and visibility to AI assistants.`,
    topIssues: issues.slice(0, 4),
    quickWins: quickWins.slice(0, 4),
    industryInsight: `In 2026, ${data.industry} businesses in ${data.city} are competing not just on Google rankings, but on AI recommendations. The businesses with AI chatbots, voice agents, and LLM-optimized content are capturing leads that others miss.`,
    llmRecommendation: data.aeoGeoAnalysis.score >= 60
      ? `ChatGPT would likely mention ${data.companyName} when asked about ${data.industry} services in ${data.city}.`
      : `ChatGPT may struggle to recommend ${data.companyName} for "${data.industry} in ${data.city}" queries due to limited structured data and AI signals.`,
  };
}

// Generate the HTML report
function generateReportHTML(data) {
  const {
    companyName,
    industry,
    city,
    url,
    scores,
    performanceMetrics,
    aiReadiness,
    aeoGeoAnalysis,
    seoAnalysis,
    securityAnalysis,
    accessibilityAnalysis,
    aiInsights,
  } = data;

  const getScoreColor = (score) => {
    if (score >= 70) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const getScoreClass = (score) => {
    if (score >= 70) return 'good';
    if (score >= 50) return 'average';
    return 'poor';
  };

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>2026 AI Website Audit - ${companyName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
        .report { max-width: 800px; margin: 0 auto; background: white; }

        .header { background: linear-gradient(135deg, #0f172a 0%, #334155 100%); color: white; padding: 50px 40px; text-align: center; }
        .logo { font-size: 22px; font-weight: 700; letter-spacing: 3px; margin-bottom: 5px; }
        .tagline { font-size: 12px; opacity: 0.7; margin-bottom: 30px; }
        .badge { display: inline-block; padding: 8px 20px; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); border-radius: 30px; font-size: 11px; font-weight: 600; letter-spacing: 1px; margin-bottom: 15px; }
        .report-title { font-size: 32px; font-weight: 300; margin-bottom: 8px; }
        .company-name { font-size: 20px; font-weight: 600; color: #60a5fa; }
        .report-date { font-size: 12px; opacity: 0.6; margin-top: 15px; }

        .scores-section { padding: 40px; background: linear-gradient(180deg, #f1f5f9 0%, white 100%); }
        .scores-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 15px; }
        .scores-grid.secondary-scores { grid-template-columns: repeat(3, 1fr); margin-bottom: 25px; }
        .score-card { text-align: center; padding: 20px 10px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .score-card.highlight { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; }
        .score-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 8px; }
        .score-value { font-size: 32px; font-weight: 700; }
        .score-value.good { color: #10b981; }
        .score-value.average { color: #f59e0b; }
        .score-value.poor { color: #ef4444; }
        .score-card.highlight .score-value { color: #60a5fa; }
        .score-max { font-size: 14px; opacity: 0.5; }

        .summary-box { background: #f8fafc; border-radius: 12px; padding: 20px; text-align: center; }
        .summary-box p { font-size: 15px; color: #475569; }

        .section { padding: 35px 40px; }
        .section-title { font-size: 20px; font-weight: 600; color: #0f172a; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
        .section-icon { width: 36px; height: 36px; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; }

        .ai-section { background: linear-gradient(135deg, #0f172a 0%, #1e1a3a 100%); color: white; }
        .ai-section .section-title { color: white; }
        .ai-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px; }
        .ai-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; }
        .ai-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .ai-card-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
        .ai-status { padding: 3px 10px; border-radius: 15px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
        .ai-status.missing { background: rgba(239,68,68,0.2); color: #fca5a5; }
        .ai-status.partial { background: rgba(245,158,11,0.2); color: #fcd34d; }
        .ai-status.good { background: rgba(16,185,129,0.2); color: #6ee7b7; }
        .ai-card-desc { font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.5; margin-bottom: 12px; }
        .ai-card-impact { font-size: 12px; padding: 10px 12px; background: rgba(255,255,255,0.05); border-radius: 6px; border-left: 3px solid #3b82f6; }
        .ai-card-impact strong { color: #60a5fa; }

        .llm-box { background: linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(139,92,246,0.2) 100%); border: 1px solid rgba(59,130,246,0.3); border-radius: 12px; padding: 20px; text-align: center; margin-top: 15px; }
        .llm-box h3 { font-size: 16px; color: #93c5fd; margin-bottom: 8px; }
        .llm-box p { font-size: 14px; color: rgba(255,255,255,0.85); }

        .metric-row { display: flex; align-items: center; padding: 15px 0; border-bottom: 1px solid #e2e8f0; }
        .metric-row:last-child { border-bottom: none; }
        .metric-info { flex: 1; }
        .metric-name { font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 2px; }
        .metric-detail { font-size: 12px; color: #64748b; }
        .metric-score { font-size: 24px; font-weight: 700; width: 70px; text-align: right; }

        .issues-section { background: #fef2f2; }
        .issue-card { background: white; border-radius: 10px; padding: 18px; margin-bottom: 12px; border-left: 4px solid #ef4444; }
        .issue-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .issue-title { font-size: 15px; font-weight: 600; color: #0f172a; }
        .issue-tag { padding: 3px 10px; border-radius: 15px; font-size: 10px; font-weight: 600; }
        .issue-tag.high { background: #fee2e2; color: #dc2626; }
        .issue-tag.medium { background: #fef3c7; color: #d97706; }
        .issue-desc { font-size: 13px; color: #64748b; }

        .quickwins-section { background: #ecfdf5; }
        .quickwin-card { background: white; border-radius: 10px; padding: 18px; margin-bottom: 12px; border-left: 4px solid #10b981; }
        .quickwin-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .quickwin-num { width: 24px; height: 24px; background: #d1fae5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
        .quickwin-title { font-size: 15px; font-weight: 600; color: #0f172a; }
        .quickwin-desc { font-size: 13px; color: #64748b; margin-left: 34px; margin-bottom: 8px; }
        .quickwin-time { display: inline-block; margin-left: 34px; padding: 3px 10px; background: #d1fae5; color: #047857; border-radius: 15px; font-size: 11px; font-weight: 500; }

        .insight-section { background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); }
        .insight-card { background: white; border-radius: 12px; padding: 25px; box-shadow: 0 2px 15px rgba(0,0,0,0.05); }
        .insight-card h3 { font-size: 16px; color: #0369a1; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .insight-card p { font-size: 14px; color: #475569; line-height: 1.7; }

        .accessibility-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .a11y-item { display: flex; align-items: center; gap: 10px; padding: 12px 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
        .a11y-item.pass { background: #ecfdf5; border-color: #a7f3d0; }
        .a11y-item.fail { background: #fef2f2; border-color: #fecaca; }
        .a11y-icon { font-size: 18px; }
        .a11y-label { font-size: 13px; font-weight: 500; color: #334155; }
        .a11y-issues { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 15px 20px; }
        .a11y-issues strong { color: #dc2626; font-size: 13px; }
        .a11y-issues ul { margin: 10px 0 0 20px; }
        .a11y-issues li { font-size: 13px; color: #7f1d1d; margin-bottom: 5px; }
        .a11y-pass-all { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 15px 20px; text-align: center; }
        .a11y-pass-all strong { color: #047857; font-size: 14px; }

        .llm-section { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: white; }
        .llm-check-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-bottom: 15px; }
        .llm-check-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .llm-check-name { font-size: 15px; font-weight: 600; }
        .llm-check-score { font-size: 12px; padding: 4px 12px; border-radius: 20px; font-weight: 600; }
        .llm-check-score.good { background: rgba(16,185,129,0.2); color: #6ee7b7; }
        .llm-check-score.partial { background: rgba(245,158,11,0.2); color: #fcd34d; }
        .llm-check-score.missing { background: rgba(239,68,68,0.2); color: #fca5a5; }
        .llm-check-why { font-size: 12px; color: rgba(255,255,255,0.6); font-style: italic; margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; }
        .llm-check-details { font-size: 13px; color: rgba(255,255,255,0.85); margin-bottom: 10px; }
        .llm-check-details li { margin-bottom: 4px; }
        .llm-check-rec { font-size: 12px; padding: 10px 12px; background: rgba(59,130,246,0.2); border-left: 3px solid #60a5fa; border-radius: 4px; color: #93c5fd; }
        .llm-check-rec strong { color: #60a5fa; }
        .llm-prediction { background: linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(59,130,246,0.3) 100%); border: 1px solid rgba(139,92,246,0.4); border-radius: 12px; padding: 20px; margin-top: 20px; }
        .llm-prediction h3 { font-size: 16px; color: #c4b5fd; margin-bottom: 10px; text-align: center; }
        .llm-prediction .query { font-size: 14px; color: #a5b4fc; text-align: center; margin-bottom: 8px; }
        .llm-prediction .result { font-size: 15px; font-weight: 600; text-align: center; color: white; }

        .footer { padding: 30px 40px; background: #0f172a; color: white; text-align: center; }
        .footer-main { font-size: 16px; margin-bottom: 8px; }
        .footer-sub { font-size: 13px; opacity: 0.7; margin-bottom: 15px; }
        .footer-contact { padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; opacity: 0.6; }

        @media (max-width: 600px) {
            .scores-grid, .ai-grid { grid-template-columns: 1fr 1fr; }
            .section { padding: 25px 20px; }
        }
        @media print { body { background: white; } .report { box-shadow: none; } }
    </style>
</head>
<body>
<div class="report">
    <div class="header">
        <div class="logo">SECOND CREW</div>
        <div class="tagline">AI-Powered Web Solutions</div>
        <div class="badge">2026 AI WEBSITE AUDIT</div>
        <div class="report-title">Website Performance + AI Readiness</div>
        <div class="company-name">${companyName}</div>
        <div class="report-date">Generated ${today}</div>
    </div>

    <div class="scores-section">
        <div class="scores-grid">
            <div class="score-card">
                <div class="score-label">Mobile Speed</div>
                <div class="score-value ${getScoreClass(scores.mobile)}">${scores.mobile}<span class="score-max">/100</span></div>
            </div>
            <div class="score-card">
                <div class="score-label">Desktop Speed</div>
                <div class="score-value ${getScoreClass(scores.desktop)}">${scores.desktop}<span class="score-max">/100</span></div>
            </div>
            <div class="score-card highlight">
                <div class="score-label">AI Readiness</div>
                <div class="score-value">${scores.aiReadiness}<span class="score-max">/100</span></div>
            </div>
            <div class="score-card">
                <div class="score-label">LLM/AEO</div>
                <div class="score-value ${getScoreClass(scores.aeoGeo)}">${scores.aeoGeo}<span class="score-max">/100</span></div>
            </div>
        </div>
        <div class="scores-grid secondary-scores">
            <div class="score-card">
                <div class="score-label">SEO</div>
                <div class="score-value ${getScoreClass(scores.seo)}">${scores.seo}<span class="score-max">/100</span></div>
            </div>
            <div class="score-card">
                <div class="score-label">Security</div>
                <div class="score-value ${getScoreClass(scores.security)}">${scores.security}<span class="score-max">/100</span></div>
            </div>
            <div class="score-card">
                <div class="score-label">Accessibility</div>
                <div class="score-value ${getScoreClass(scores.accessibility)}">${scores.accessibility}<span class="score-max">/100</span></div>
            </div>
        </div>
        <div class="summary-box">
            <p>${aiInsights.executiveSummary}</p>
        </div>
    </div>

    <div class="section ai-section">
        <h2 class="section-title"><span class="section-icon">🤖</span> 2026 AI Readiness Assessment</h2>
        <div class="ai-grid">
            <div class="ai-card">
                <div class="ai-card-header">
                    <div class="ai-card-title">💬 AI Chatbot</div>
                    <span class="ai-status ${aiReadiness.features.chatbot?.detected ? 'good' : 'missing'}">${aiReadiness.features.chatbot?.detected ? 'Detected' : 'Not Found'}</span>
                </div>
                <p class="ai-card-desc">${aiReadiness.features.chatbot?.detected ? 'AI chatbot detected for 24/7 lead qualification.' : 'No AI chatbot detected. Visitors leaving after hours cannot get immediate answers.'}</p>
                <div class="ai-card-impact"><strong>Impact:</strong> ${aiReadiness.features.chatbot?.detected ? 'Capturing leads around the clock.' : '78% of customers hire the first business to respond.'}</div>
            </div>
            <div class="ai-card">
                <div class="ai-card-header">
                    <div class="ai-card-title">📞 AI Voice Agent</div>
                    <span class="ai-status ${aiReadiness.features.voiceAgent?.detected ? 'good' : 'missing'}">${aiReadiness.features.voiceAgent?.detected ? 'Detected' : 'Not Found'}</span>
                </div>
                <p class="ai-card-desc">${aiReadiness.features.voiceAgent?.detected ? 'AI voice agent handles calls when unavailable.' : 'After-hours calls go to voicemail. Callers are moving to competitors.'}</p>
                <div class="ai-card-impact"><strong>Impact:</strong> ${aiReadiness.features.voiceAgent?.detected ? 'Never missing a call.' : 'Weekend and evening leads calling competitors.'}</div>
            </div>
            <div class="ai-card">
                <div class="ai-card-header">
                    <div class="ai-card-title">🧮 Quote/Calculator Tool</div>
                    <span class="ai-status ${aiReadiness.features.calculator?.detected ? 'good' : 'missing'}">${aiReadiness.features.calculator?.detected ? 'Detected' : 'Not Found'}</span>
                </div>
                <p class="ai-card-desc">${aiReadiness.features.calculator?.detected ? 'Interactive tool provides instant estimates.' : 'Using traditional contact form. Visitors want instant pricing answers.'}</p>
                <div class="ai-card-impact"><strong>Impact:</strong> ${aiReadiness.features.calculator?.detected ? 'Converting visitors with instant value.' : 'AI calculators convert 3x better than forms.'}</div>
            </div>
            <div class="ai-card">
                <div class="ai-card-header">
                    <div class="ai-card-title">🔍 LLM Optimization</div>
                    <span class="ai-status ${scores.aeoGeo >= 60 ? 'good' : scores.aeoGeo >= 40 ? 'partial' : 'missing'}">${scores.aeoGeo >= 60 ? 'Optimized' : scores.aeoGeo >= 40 ? 'Needs Work' : 'Not Optimized'}</span>
                </div>
                <p class="ai-card-desc">${scores.aeoGeo >= 60 ? 'Site structured for AI assistants to understand and recommend.' : 'Limited structured data. AI assistants may not recommend this business.'}</p>
                <div class="ai-card-impact"><strong>Impact:</strong> ${aiInsights.llmRecommendation}</div>
            </div>
        </div>
        <div class="llm-box">
            <h3>🎯 ChatGPT Recommendation Test</h3>
            <p>${aiInsights.llmRecommendation}</p>
        </div>
    </div>

    <div class="section llm-section">
        <h2 class="section-title" style="color: white;"><span class="section-icon">🧠</span> LLM Optimization Deep Dive (AEO/GEO)</h2>
        <p style="font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 20px;">This section explains exactly what AI assistants like ChatGPT, Perplexity, and Google AI look for when deciding whether to recommend your business.</p>

        ${aeoGeoAnalysis.detailedChecks ? aeoGeoAnalysis.detailedChecks.map(check => `
        <div class="llm-check-card">
            <div class="llm-check-header">
                <div class="llm-check-name">${check.name}</div>
                <span class="llm-check-score ${check.status}">${check.score}/${check.maxScore} pts</span>
            </div>
            <div class="llm-check-why">💡 Why it matters: ${check.whyItMatters}</div>
            <ul class="llm-check-details">
                ${check.details.map(d => `<li>${d}</li>`).join('')}
            </ul>
            ${check.recommendation ? `<div class="llm-check-rec"><strong>Recommendation:</strong> ${check.recommendation}</div>` : ''}
        </div>
        `).join('') : ''}

        <div class="llm-prediction">
            <h3>🔮 AI Recommendation Prediction</h3>
            <div class="query">Query: "${aeoGeoAnalysis.llmContext?.testQuery || `Best ${industry} in ${city}`}"</div>
            <div class="result">${aeoGeoAnalysis.llmContext?.prediction || (scores.aeoGeo >= 60 ? 'Likely to be recommended' : 'Improvements needed')}</div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title"><span class="section-icon">⚡</span> Performance Metrics</h2>
        <div class="metric-row">
            <div class="metric-info">
                <div class="metric-name">First Contentful Paint</div>
                <div class="metric-detail">When visitors first see content (target: under 1.8s)</div>
            </div>
            <div class="metric-score" style="color: ${getScoreColor(parseFloat(performanceMetrics.firstContentfulPaint) < 2 ? 70 : parseFloat(performanceMetrics.firstContentfulPaint) < 4 ? 50 : 30)}">${performanceMetrics.firstContentfulPaint}</div>
        </div>
        <div class="metric-row">
            <div class="metric-info">
                <div class="metric-name">Largest Contentful Paint</div>
                <div class="metric-detail">When main content loads (target: under 2.5s)</div>
            </div>
            <div class="metric-score" style="color: ${getScoreColor(parseFloat(performanceMetrics.largestContentfulPaint) < 2.5 ? 70 : parseFloat(performanceMetrics.largestContentfulPaint) < 4 ? 50 : 30)}">${performanceMetrics.largestContentfulPaint}</div>
        </div>
        <div class="metric-row">
            <div class="metric-info">
                <div class="metric-name">Time to Interactive</div>
                <div class="metric-detail">When users can interact (target: under 3.8s)</div>
            </div>
            <div class="metric-score" style="color: ${getScoreColor(parseFloat(performanceMetrics.timeToInteractive) < 3.8 ? 70 : parseFloat(performanceMetrics.timeToInteractive) < 7 ? 50 : 30)}">${performanceMetrics.timeToInteractive}</div>
        </div>
        <div class="metric-row">
            <div class="metric-info">
                <div class="metric-name">Cumulative Layout Shift</div>
                <div class="metric-detail">Visual stability (target: under 0.1)</div>
            </div>
            <div class="metric-score" style="color: ${getScoreColor(parseFloat(performanceMetrics.cumulativeLayoutShift) < 0.1 ? 70 : parseFloat(performanceMetrics.cumulativeLayoutShift) < 0.25 ? 50 : 30)}">${performanceMetrics.cumulativeLayoutShift}</div>
        </div>
    </div>

    <div class="section">
        <h2 class="section-title"><span class="section-icon">♿</span> Accessibility Check</h2>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 20px;">Accessibility ensures your website works for everyone, including people using screen readers or keyboard navigation. It also affects SEO and legal compliance.</p>
        <div class="accessibility-grid">
            <div class="a11y-item ${accessibilityAnalysis.checks.altText ? 'pass' : 'fail'}">
                <span class="a11y-icon">${accessibilityAnalysis.checks.altText ? '✅' : '❌'}</span>
                <span class="a11y-label">Image Alt Text</span>
            </div>
            <div class="a11y-item ${accessibilityAnalysis.checks.headingHierarchy ? 'pass' : 'fail'}">
                <span class="a11y-icon">${accessibilityAnalysis.checks.headingHierarchy ? '✅' : '❌'}</span>
                <span class="a11y-label">Heading Structure</span>
            </div>
            <div class="a11y-item ${accessibilityAnalysis.checks.formLabels ? 'pass' : 'fail'}">
                <span class="a11y-icon">${accessibilityAnalysis.checks.formLabels ? '✅' : '❌'}</span>
                <span class="a11y-label">Form Labels</span>
            </div>
            <div class="a11y-item ${accessibilityAnalysis.checks.ariaLandmarks ? 'pass' : 'fail'}">
                <span class="a11y-icon">${accessibilityAnalysis.checks.ariaLandmarks ? '✅' : '❌'}</span>
                <span class="a11y-label">ARIA Landmarks</span>
            </div>
            <div class="a11y-item ${accessibilityAnalysis.checks.langAttribute ? 'pass' : 'fail'}">
                <span class="a11y-icon">${accessibilityAnalysis.checks.langAttribute ? '✅' : '❌'}</span>
                <span class="a11y-label">Language Attribute</span>
            </div>
            <div class="a11y-item ${accessibilityAnalysis.checks.skipLinks ? 'pass' : 'fail'}">
                <span class="a11y-icon">${accessibilityAnalysis.checks.skipLinks ? '✅' : '❌'}</span>
                <span class="a11y-label">Skip Navigation</span>
            </div>
        </div>
        ${accessibilityAnalysis.issues.length > 0 ? `
        <div class="a11y-issues">
            <strong>Issues Found:</strong>
            <ul>
                ${accessibilityAnalysis.issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
        </div>
        ` : '<div class="a11y-pass-all"><strong>✨ Great job!</strong> No major accessibility issues detected.</div>'}
    </div>

    <div class="section issues-section">
        <h2 class="section-title"><span class="section-icon">⚠️</span> Top Issues Affecting Your Business</h2>
        ${aiInsights.topIssues.map(issue => `
        <div class="issue-card">
            <div class="issue-header">
                <div class="issue-title">${issue.title}</div>
                <span class="issue-tag ${issue.impact.toLowerCase()}">${issue.impact} Impact</span>
            </div>
            <p class="issue-desc">${issue.description}</p>
        </div>
        `).join('')}
    </div>

    <div class="section quickwins-section">
        <h2 class="section-title"><span class="section-icon">✅</span> Quick Wins You Can Do Today</h2>
        ${aiInsights.quickWins.map((win, i) => `
        <div class="quickwin-card">
            <div class="quickwin-header">
                <div class="quickwin-num">${i + 1}</div>
                <div class="quickwin-title">${win.title}</div>
            </div>
            <p class="quickwin-desc">${win.description}</p>
            <span class="quickwin-time">⏱ ${win.timeEstimate}</span>
        </div>
        `).join('')}
    </div>

    <div class="section insight-section">
        <h2 class="section-title"><span class="section-icon">💡</span> 2026 ${industry} Insight</h2>
        <div class="insight-card">
            <h3>🎯 What This Means for Your Business</h3>
            <p>${aiInsights.industryInsight}</p>
        </div>
    </div>

    <div class="footer">
        <p class="footer-main">Questions about this report?</p>
        <p class="footer-sub">Just reply to this email - happy to explain anything in more detail.</p>
        <div class="footer-contact">
            Alex Murillo | Second Crew | secondcrew.com
        </div>
    </div>
</div>
</body>
</html>`;
}

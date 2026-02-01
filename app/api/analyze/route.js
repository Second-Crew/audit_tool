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

// Analyze SEO - DETAILED analysis with recommendations
function analyzeSEO(data, pageSpeedData) {
  if (data.error) {
    return { score: 0, issues: [], detailedChecks: [] };
  }

  let score = 0;
  const issues = [];
  const checks = {};
  const detailedChecks = [];

  // 1. Meta Title (15 points)
  const titleCheck = {
    name: 'Meta Title',
    icon: '📝',
    status: 'missing',
    score: 0,
    maxScore: 15,
    value: data.metaTags?.title || null,
    length: data.metaTags?.title?.length || 0,
    target: '50-60 characters',
    recommendation: '',
  };

  if (data.metaTags?.title) {
    titleCheck.score = 10;
    titleCheck.status = 'partial';
    checks.title = true;
    if (data.metaTags.title.length >= 30 && data.metaTags.title.length <= 60) {
      titleCheck.score = 15;
      titleCheck.status = 'good';
    } else if (data.metaTags.title.length < 30) {
      titleCheck.recommendation = 'Title is too short. Add more descriptive keywords.';
    } else {
      titleCheck.recommendation = 'Title is too long and may be truncated in search results.';
    }
  } else {
    titleCheck.status = 'missing';
    titleCheck.recommendation = 'Add a unique, descriptive title tag with your main keyword and location.';
    issues.push('Missing title tag');
    checks.title = false;
  }
  score += titleCheck.score;
  detailedChecks.push(titleCheck);

  // 2. Meta Description (15 points)
  const descCheck = {
    name: 'Meta Description',
    icon: '📋',
    status: 'missing',
    score: 0,
    maxScore: 15,
    value: data.metaTags?.description || null,
    length: data.metaTags?.description?.length || 0,
    target: '150-160 characters',
    recommendation: '',
  };

  if (data.metaTags?.description) {
    descCheck.score = 10;
    descCheck.status = 'partial';
    checks.description = true;
    if (data.metaTags.description.length >= 120 && data.metaTags.description.length <= 160) {
      descCheck.score = 15;
      descCheck.status = 'good';
    } else if (data.metaTags.description.length < 120) {
      descCheck.recommendation = 'Description is too short. Expand to include services, location, and a call-to-action.';
    } else {
      descCheck.recommendation = 'Description is too long and will be truncated in search results.';
    }
  } else {
    descCheck.status = 'missing';
    descCheck.recommendation = 'Add a compelling meta description with your services, location, and a call-to-action.';
    issues.push('Missing meta description');
    checks.description = false;
  }
  score += descCheck.score;
  detailedChecks.push(descCheck);

  // 3. H1 Heading (15 points)
  const h1Check = {
    name: 'H1 Heading',
    icon: '🔤',
    status: 'missing',
    score: 0,
    maxScore: 15,
    value: data.headings?.h1?.[0] || null,
    count: data.headings?.h1?.length || 0,
    recommendation: '',
  };

  if (data.headings?.h1?.length === 1) {
    h1Check.score = 15;
    h1Check.status = 'good';
    checks.h1 = true;
  } else if (data.headings?.h1?.length > 1) {
    h1Check.score = 5;
    h1Check.status = 'partial';
    h1Check.recommendation = `Found ${data.headings.h1.length} H1 tags. Use only one H1 per page for better SEO.`;
    issues.push('Multiple H1 tags found');
    checks.h1 = false;
  } else {
    h1Check.status = 'missing';
    h1Check.recommendation = 'Add a single H1 tag with your main keyword. This is crucial for SEO.';
    issues.push('Missing H1 tag');
    checks.h1 = false;
  }
  score += h1Check.score;
  detailedChecks.push(h1Check);

  // 4. Schema Markup (15 points)
  const schemaCheck = {
    name: 'Schema Markup',
    icon: '🏷️',
    status: 'missing',
    score: 0,
    maxScore: 15,
    types: data.schemaMarkup?.schemas?.map(s => s.schemaType) || [],
    hasLocalBusiness: data.schemaMarkup?.hasLocalBusiness || false,
    hasFAQ: data.schemaMarkup?.hasFAQSchema || false,
    recommendation: '',
  };

  if (data.schemaMarkup?.found) {
    schemaCheck.score = 10;
    schemaCheck.status = 'partial';
    checks.schema = true;
    if (data.schemaMarkup.hasLocalBusiness) {
      schemaCheck.score += 3;
    }
    if (data.schemaMarkup.hasFAQSchema) {
      schemaCheck.score += 2;
      schemaCheck.status = 'good';
    }
    if (!data.schemaMarkup.hasLocalBusiness) {
      schemaCheck.recommendation = 'Add LocalBusiness schema for better local search visibility.';
    }
  } else {
    schemaCheck.status = 'missing';
    schemaCheck.recommendation = 'Add LocalBusiness, Service, and FAQPage schema markup to enable rich snippets in search results.';
    issues.push('No schema markup detected');
    checks.schema = false;
  }
  score += schemaCheck.score;
  detailedChecks.push(schemaCheck);

  // 5. Canonical URL (10 points)
  const canonicalCheck = {
    name: 'Canonical URL',
    icon: '🔗',
    status: 'missing',
    score: 0,
    maxScore: 10,
    value: data.metaTags?.canonical || null,
    recommendation: '',
  };

  if (data.metaTags?.canonical) {
    canonicalCheck.score = 10;
    canonicalCheck.status = 'good';
    checks.canonical = true;
  } else {
    canonicalCheck.status = 'missing';
    canonicalCheck.recommendation = 'Add a canonical URL to prevent duplicate content issues.';
    issues.push('Missing canonical URL');
    checks.canonical = false;
  }
  score += canonicalCheck.score;
  detailedChecks.push(canonicalCheck);

  // 6. Open Graph Tags (10 points)
  const ogCheck = {
    name: 'Open Graph Tags',
    icon: '📱',
    status: 'missing',
    score: 0,
    maxScore: 10,
    hasTitle: !!data.metaTags?.ogTitle,
    hasDescription: !!data.metaTags?.ogDescription,
    hasImage: /<meta[^>]*property=["']og:image["']/i.test(data.html || ''),
    recommendation: '',
  };

  if (data.metaTags?.ogTitle && data.metaTags?.ogDescription) {
    ogCheck.score = 7;
    ogCheck.status = 'partial';
    checks.openGraph = true;
    if (ogCheck.hasImage) {
      ogCheck.score = 10;
      ogCheck.status = 'good';
    } else {
      ogCheck.recommendation = 'Add og:image (1200x630px) for better social sharing appearance.';
    }
  } else {
    ogCheck.status = 'missing';
    ogCheck.recommendation = 'Add Open Graph tags (og:title, og:description, og:image) for better social media sharing.';
    issues.push('Missing Open Graph tags');
    checks.openGraph = false;
  }
  score += ogCheck.score;
  detailedChecks.push(ogCheck);

  // 7. Robots Meta (5 points)
  const robotsCheck = {
    name: 'Robots Meta',
    icon: '🤖',
    status: 'good',
    score: 5,
    maxScore: 5,
    value: data.metaTags?.robots || 'index, follow (default)',
    isIndexable: !data.metaTags?.robots?.includes('noindex'),
    recommendation: '',
  };

  if (data.metaTags?.robots?.includes('noindex')) {
    robotsCheck.score = 0;
    robotsCheck.status = 'warning';
    robotsCheck.recommendation = 'Page is set to noindex - it will not appear in search results.';
    issues.push('Page set to noindex');
  }
  score += robotsCheck.score;
  checks.robots = robotsCheck.isIndexable;
  detailedChecks.push(robotsCheck);

  // 8. Mobile Friendly (10 points)
  const mobileCheck = {
    name: 'Mobile Friendly',
    icon: '📱',
    status: 'missing',
    score: 0,
    maxScore: 10,
    hasViewport: /<meta[^>]*name=["']viewport["']/i.test(data.html || ''),
    lighthouseScore: pageSpeedData?.lighthouseResult?.categories?.performance?.score,
    recommendation: '',
  };

  const mobilePerfScore = pageSpeedData?.lighthouseResult?.categories?.performance?.score || 0;
  if (mobileCheck.hasViewport && mobilePerfScore >= 0.5) {
    mobileCheck.score = 10;
    mobileCheck.status = 'good';
    checks.mobile = true;
  } else if (mobileCheck.hasViewport) {
    mobileCheck.score = 5;
    mobileCheck.status = 'partial';
    mobileCheck.recommendation = 'Viewport is set but mobile performance needs improvement.';
    checks.mobile = false;
  } else {
    mobileCheck.status = 'missing';
    mobileCheck.recommendation = 'Add viewport meta tag for proper mobile rendering.';
    issues.push('Not mobile-friendly');
    checks.mobile = false;
  }
  score += mobileCheck.score;
  detailedChecks.push(mobileCheck);

  // 9. HTTPS (10 points)
  const httpsCheck = {
    name: 'HTTPS Security',
    icon: '🔒',
    status: 'missing',
    score: 0,
    maxScore: 10,
    isSecure: data.hasHttps,
    recommendation: '',
  };

  if (data.hasHttps) {
    httpsCheck.score = 10;
    httpsCheck.status = 'good';
    checks.https = true;
  } else {
    httpsCheck.status = 'missing';
    httpsCheck.recommendation = 'Switch to HTTPS. This is a ranking factor and essential for user trust.';
    issues.push('Site not using HTTPS');
    checks.https = false;
  }
  score += httpsCheck.score;
  detailedChecks.push(httpsCheck);

  // 10. Core Web Vitals (10 points)
  const cwvCheck = {
    name: 'Core Web Vitals',
    icon: '⚡',
    status: 'missing',
    score: 0,
    maxScore: 10,
    fcp: pageSpeedData?.lighthouseResult?.audits?.['first-contentful-paint']?.displayValue || 'N/A',
    lcp: pageSpeedData?.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue || 'N/A',
    cls: pageSpeedData?.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue || 'N/A',
    recommendation: '',
  };

  const perfScore = pageSpeedData?.lighthouseResult?.categories?.performance?.score || 0;
  if (perfScore >= 0.9) {
    cwvCheck.score = 10;
    cwvCheck.status = 'good';
  } else if (perfScore >= 0.5) {
    cwvCheck.score = 5;
    cwvCheck.status = 'partial';
    cwvCheck.recommendation = 'Improve page speed by optimizing images, reducing JavaScript, and enabling caching.';
  } else {
    cwvCheck.status = 'missing';
    cwvCheck.recommendation = 'Page speed is poor. Compress images, minimize CSS/JS, and consider a faster host.';
    issues.push('Poor Core Web Vitals');
  }
  score += cwvCheck.score;
  detailedChecks.push(cwvCheck);

  // Calculate passed/failed counts
  const passedChecks = detailedChecks.filter(c => c.status === 'good').length;
  const failedChecks = detailedChecks.filter(c => c.status === 'missing' || c.status === 'partial').length;

  return {
    score: Math.min(score, 100),
    checks,
    issues,
    metaTags: data.metaTags,
    detailedChecks,
    passedChecks,
    failedChecks,
  };
}

// Analyze security headers - COMPREHENSIVE analysis with recommendations
function analyzeSecurityHeaders(url, data) {
  let score = 0;
  const issues = [];
  const checks = {};
  const detailedChecks = [];

  const html = data.html || '';
  const headers = data.headers || {};

  // 1. HTTPS (25 points)
  const httpsCheck = {
    name: 'HTTPS / SSL Certificate',
    status: 'missing',
    score: 0,
    maxScore: 25,
    details: [],
    whyItMatters: 'HTTPS encrypts data between visitors and your website. Without it, hackers can intercept passwords, form data, and personal information. Google also penalizes non-HTTPS sites in search rankings.',
    recommendation: '',
  };

  if (url.startsWith('https://')) {
    httpsCheck.score = 25;
    httpsCheck.status = 'good';
    httpsCheck.details.push('✓ Site uses HTTPS encryption');
    checks.https = true;
  } else {
    httpsCheck.status = 'missing';
    httpsCheck.details.push('✗ Site not using HTTPS - data is transmitted unencrypted');
    httpsCheck.recommendation = 'Install an SSL certificate immediately. Most hosts offer free SSL via Let\'s Encrypt. This is critical for security and SEO.';
    issues.push('Not using HTTPS - customer data is at risk');
    checks.https = false;
  }
  score += httpsCheck.score;
  detailedChecks.push(httpsCheck);

  // 2. HSTS - HTTP Strict Transport Security (15 points)
  const hstsCheck = {
    name: 'HSTS (HTTP Strict Transport Security)',
    status: 'missing',
    score: 0,
    maxScore: 15,
    details: [],
    whyItMatters: 'HSTS forces browsers to always use HTTPS, preventing downgrade attacks where hackers trick browsers into using insecure HTTP connections.',
    recommendation: '',
  };

  if (headers['strict-transport-security']) {
    hstsCheck.score = 15;
    hstsCheck.status = 'good';
    hstsCheck.details.push('✓ HSTS header present');
    const hstsValue = headers['strict-transport-security'];
    if (hstsValue.includes('max-age=')) {
      const maxAge = hstsValue.match(/max-age=(\d+)/);
      if (maxAge && parseInt(maxAge[1]) >= 31536000) {
        hstsCheck.details.push('✓ Max-age is 1 year or more (recommended)');
      }
    }
    if (hstsValue.includes('includeSubDomains')) {
      hstsCheck.details.push('✓ Includes subdomains');
    }
    checks.hsts = true;
  } else {
    hstsCheck.status = 'missing';
    hstsCheck.details.push('✗ No HSTS header found');
    hstsCheck.recommendation = 'Add the header: Strict-Transport-Security: max-age=31536000; includeSubDomains. This can be configured in your web server or CDN settings.';
    issues.push('Missing HSTS header - browsers may connect via insecure HTTP');
    checks.hsts = false;
  }
  score += hstsCheck.score;
  detailedChecks.push(hstsCheck);

  // 3. Content Security Policy (15 points)
  const cspCheck = {
    name: 'Content Security Policy (CSP)',
    status: 'missing',
    score: 0,
    maxScore: 15,
    details: [],
    whyItMatters: 'CSP prevents XSS (cross-site scripting) attacks by controlling which scripts, styles, and resources can load on your site. Without it, attackers can inject malicious code.',
    recommendation: '',
  };

  if (headers['content-security-policy']) {
    cspCheck.score = 15;
    cspCheck.status = 'good';
    cspCheck.details.push('✓ Content Security Policy header present');
    const cspValue = headers['content-security-policy'];
    if (cspValue.includes('default-src')) {
      cspCheck.details.push('✓ Has default-src directive');
    }
    if (cspValue.includes('script-src')) {
      cspCheck.details.push('✓ Has script-src directive');
    }
    if (cspValue.includes('unsafe-inline') || cspValue.includes('unsafe-eval')) {
      cspCheck.details.push('⚠ Uses unsafe-inline or unsafe-eval (reduces protection)');
      cspCheck.status = 'partial';
      cspCheck.score = 10;
    }
    checks.csp = true;
  } else {
    cspCheck.status = 'missing';
    cspCheck.details.push('✗ No Content Security Policy found');
    cspCheck.recommendation = 'Implement a CSP header. Start with: Content-Security-Policy: default-src \'self\'; script-src \'self\' trusted-cdn.com; This blocks unauthorized scripts from running.';
    issues.push('No Content Security Policy - site vulnerable to XSS attacks');
    checks.csp = false;
  }
  score += cspCheck.score;
  detailedChecks.push(cspCheck);

  // 4. X-Frame-Options / Clickjacking Protection (10 points)
  const frameCheck = {
    name: 'Clickjacking Protection',
    status: 'missing',
    score: 0,
    maxScore: 10,
    details: [],
    whyItMatters: 'Clickjacking attacks trick users into clicking hidden buttons by embedding your site in an invisible iframe. Attackers can steal clicks, credentials, or trigger unwanted actions.',
    recommendation: '',
  };

  if (headers['x-frame-options'] || headers['content-security-policy']?.includes('frame-ancestors')) {
    frameCheck.score = 10;
    frameCheck.status = 'good';
    if (headers['x-frame-options']) {
      frameCheck.details.push(`✓ X-Frame-Options: ${headers['x-frame-options']}`);
    }
    if (headers['content-security-policy']?.includes('frame-ancestors')) {
      frameCheck.details.push('✓ CSP frame-ancestors directive set');
    }
    checks.clickjacking = true;
  } else {
    frameCheck.status = 'missing';
    frameCheck.details.push('✗ No clickjacking protection found');
    frameCheck.recommendation = 'Add the header: X-Frame-Options: DENY (or SAMEORIGIN if you embed your own content). This prevents your site from being embedded in malicious iframes.';
    issues.push('No clickjacking protection - site can be embedded in malicious iframes');
    checks.clickjacking = false;
  }
  score += frameCheck.score;
  detailedChecks.push(frameCheck);

  // 5. X-Content-Type-Options (10 points)
  const mimeCheck = {
    name: 'MIME Type Sniffing Protection',
    status: 'missing',
    score: 0,
    maxScore: 10,
    details: [],
    whyItMatters: 'MIME sniffing allows browsers to "guess" file types, which attackers exploit by uploading malicious files disguised as images. This header prevents that behavior.',
    recommendation: '',
  };

  if (headers['x-content-type-options'] === 'nosniff') {
    mimeCheck.score = 10;
    mimeCheck.status = 'good';
    mimeCheck.details.push('✓ X-Content-Type-Options: nosniff');
    checks.mimeSniffing = true;
  } else if (headers['x-content-type-options']) {
    mimeCheck.score = 5;
    mimeCheck.status = 'partial';
    mimeCheck.details.push(`⚠ X-Content-Type-Options present but not set to "nosniff"`);
    checks.mimeSniffing = false;
  } else {
    mimeCheck.status = 'missing';
    mimeCheck.details.push('✗ No X-Content-Type-Options header');
    mimeCheck.recommendation = 'Add the header: X-Content-Type-Options: nosniff. This is a simple, one-line security improvement.';
    checks.mimeSniffing = false;
  }
  score += mimeCheck.score;
  detailedChecks.push(mimeCheck);

  // 6. Referrer Policy (5 points)
  const referrerCheck = {
    name: 'Referrer Policy',
    status: 'missing',
    score: 0,
    maxScore: 5,
    details: [],
    whyItMatters: 'Controls what URL information is sent when users click links to other sites. Without it, sensitive page URLs (with tokens, IDs, etc.) may leak to third parties.',
    recommendation: '',
  };

  if (headers['referrer-policy']) {
    referrerCheck.score = 5;
    referrerCheck.status = 'good';
    referrerCheck.details.push(`✓ Referrer-Policy: ${headers['referrer-policy']}`);
    checks.referrerPolicy = true;
  } else {
    referrerCheck.status = 'missing';
    referrerCheck.details.push('✗ No Referrer-Policy header');
    referrerCheck.recommendation = 'Add: Referrer-Policy: strict-origin-when-cross-origin. This limits what URL info is shared with other sites.';
    checks.referrerPolicy = false;
  }
  score += referrerCheck.score;
  detailedChecks.push(referrerCheck);

  // 7. Permissions Policy (5 points)
  const permissionsCheck = {
    name: 'Permissions Policy (Feature Policy)',
    status: 'missing',
    score: 0,
    maxScore: 5,
    details: [],
    whyItMatters: 'Controls which browser features (camera, microphone, geolocation) can be used. Prevents malicious scripts from accessing sensitive device features.',
    recommendation: '',
  };

  if (headers['permissions-policy'] || headers['feature-policy']) {
    permissionsCheck.score = 5;
    permissionsCheck.status = 'good';
    permissionsCheck.details.push('✓ Permissions Policy header present');
    checks.permissionsPolicy = true;
  } else {
    permissionsCheck.status = 'missing';
    permissionsCheck.details.push('✗ No Permissions Policy header');
    permissionsCheck.recommendation = 'Add: Permissions-Policy: camera=(), microphone=(), geolocation=(). This blocks unwanted access to device features.';
    checks.permissionsPolicy = false;
  }
  score += permissionsCheck.score;
  detailedChecks.push(permissionsCheck);

  // 8. Mixed Content Check (10 points)
  const mixedContentCheck = {
    name: 'Mixed Content',
    status: 'missing',
    score: 0,
    maxScore: 10,
    details: [],
    whyItMatters: 'Mixed content occurs when HTTPS pages load resources (images, scripts) over HTTP. This creates security holes that attackers can exploit, and browsers may block the content.',
    recommendation: '',
  };

  if (url.startsWith('https://')) {
    const httpResources = html.match(/http:\/\/[^"'\s]+\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)/gi) || [];
    const httpScripts = html.match(/src=["']http:\/\//gi) || [];
    const httpLinks = html.match(/href=["']http:\/\/[^"']*\.(css|js)/gi) || [];

    if (httpResources.length === 0 && httpScripts.length === 0 && httpLinks.length === 0) {
      mixedContentCheck.score = 10;
      mixedContentCheck.status = 'good';
      mixedContentCheck.details.push('✓ No mixed content detected');
      checks.mixedContent = true;
    } else {
      mixedContentCheck.status = 'missing';
      mixedContentCheck.details.push(`✗ Found ${httpResources.length + httpScripts.length + httpLinks.length} HTTP resources on HTTPS page`);
      mixedContentCheck.recommendation = 'Update all resource URLs to use HTTPS, or use protocol-relative URLs (//example.com/resource.js). Check images, scripts, stylesheets, and fonts.';
      issues.push('Mixed content found - HTTP resources on HTTPS page');
      checks.mixedContent = false;
    }
  } else {
    mixedContentCheck.status = 'partial';
    mixedContentCheck.details.push('⚠ Cannot check - site not using HTTPS');
    mixedContentCheck.score = 0;
    checks.mixedContent = false;
  }
  score += mixedContentCheck.score;
  detailedChecks.push(mixedContentCheck);

  // 9. Exposed Server Info (5 points) - Check for info disclosure
  const serverInfoCheck = {
    name: 'Server Information Exposure',
    status: 'missing',
    score: 0,
    maxScore: 5,
    details: [],
    whyItMatters: 'Exposing server software and versions helps attackers find known vulnerabilities. Hiding this info makes attacks harder.',
    recommendation: '',
  };

  const serverHeader = headers['server'] || '';
  const poweredBy = headers['x-powered-by'] || '';

  if (!serverHeader && !poweredBy) {
    serverInfoCheck.score = 5;
    serverInfoCheck.status = 'good';
    serverInfoCheck.details.push('✓ No server version information exposed');
    checks.serverInfo = true;
  } else {
    serverInfoCheck.status = 'partial';
    if (serverHeader) {
      serverInfoCheck.details.push(`⚠ Server header exposed: ${serverHeader}`);
    }
    if (poweredBy) {
      serverInfoCheck.details.push(`⚠ X-Powered-By header exposed: ${poweredBy}`);
    }
    serverInfoCheck.score = 2;
    serverInfoCheck.recommendation = 'Remove or obscure Server and X-Powered-By headers in your web server config. Attackers use this info to find exploits.';
    checks.serverInfo = false;
  }
  score += serverInfoCheck.score;
  detailedChecks.push(serverInfoCheck);

  // Calculate overall security grade
  const securityGrade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';

  return {
    score: Math.min(score, 100),
    grade: securityGrade,
    issues,
    checks,
    detailedChecks,
    hasHttps: url.startsWith('https://'),
    summary: score >= 70
      ? 'Good security posture with minor improvements possible.'
      : score >= 50
        ? 'Moderate security - several important headers missing.'
        : 'Security needs attention - multiple vulnerabilities detected.',
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

  const getScoreClass = (score) => {
    if (score >= 70) return 'good';
    if (score >= 50) return 'average';
    return 'poor';
  };

  const getStrokeDashoffset = (score) => {
    // Circle circumference is 97.4 (2 * PI * 15.5)
    return 97.4 - (score / 100) * 97.4;
  };

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Count issues for urgency
  const criticalIssues = [];
  if (!aiReadiness.features.chatbot?.detected) criticalIssues.push('No AI Chatbot');
  if (!aiReadiness.features.voiceAgent?.detected) criticalIssues.push('No Voice Agent');
  if (scores.aeoGeo < 50) criticalIssues.push('Poor LLM Visibility');

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>2026 AI Website Audit - ${companyName}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
            --bg-primary: #0f0f1a;
            --bg-secondary: #1a1a2e;
            --bg-tertiary: #16213e;
            --text-primary: #fff;
            --text-secondary: rgba(255,255,255,0.7);
            --text-muted: rgba(255,255,255,0.5);
            --border-color: rgba(255,255,255,0.08);
            --card-bg: rgba(255,255,255,0.03);
            --card-hover: rgba(255,255,255,0.05);
        }

        [data-theme="light"] {
            --bg-primary: #f8fafc;
            --bg-secondary: #ffffff;
            --bg-tertiary: #f1f5f9;
            --text-primary: #0f172a;
            --text-secondary: #475569;
            --text-muted: #94a3b8;
            --border-color: #e2e8f0;
            --card-bg: #ffffff;
            --card-hover: #f8fafc;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 50%, var(--bg-tertiary) 100%);
            color: var(--text-primary);
            line-height: 1.6;
            min-height: 100vh;
        }

        [data-theme="light"] body {
            background: var(--bg-primary);
        }

        .report {
            max-width: 1000px;
            margin: 0 auto;
            padding: 40px 20px;
        }

        /* Theme Toggle */
        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 30px;
            padding: 8px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: var(--text-primary);
            transition: all 0.3s ease;
        }

        .theme-toggle:hover {
            background: var(--card-hover);
        }

        /* Header */
        .header {
            text-align: center;
            padding: 60px 40px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
            border-radius: 24px;
            border: 1px solid var(--border-color);
            margin-bottom: 40px;
            position: relative;
            overflow: hidden;
        }

        [data-theme="light"] .header {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
        }

        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 50%);
            animation: pulse 4s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.3; }
        }

        .logo {
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 4px;
            color: var(--text-muted);
            margin-bottom: 20px;
            position: relative;
        }

        [data-theme="light"] .logo { color: rgba(255,255,255,0.8); }

        .badge {
            display: inline-block;
            padding: 8px 20px;
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            border-radius: 30px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 2px;
            margin-bottom: 20px;
            position: relative;
            color: white;
        }

        .report-title {
            font-size: 42px;
            font-weight: 800;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            position: relative;
        }

        [data-theme="light"] .report-title {
            background: white;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .company-name {
            font-size: 24px;
            font-weight: 500;
            color: #a5b4fc;
            position: relative;
        }

        [data-theme="light"] .company-name { color: rgba(255,255,255,0.9); }

        .report-meta {
            margin-top: 20px;
            font-size: 13px;
            color: var(--text-muted);
            position: relative;
        }

        [data-theme="light"] .report-meta { color: rgba(255,255,255,0.7); }

        /* Score Cards Grid */
        .scores-section { margin-bottom: 40px; }

        .scores-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 20px;
        }

        .scores-grid.secondary { grid-template-columns: repeat(3, 1fr); }

        .score-card {
            background: var(--card-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            padding: 28px 20px;
            text-align: center;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        [data-theme="light"] .score-card {
            background: white;
            box-shadow: 0 2px 15px rgba(0,0,0,0.08);
        }

        .score-card:hover {
            transform: translateY(-4px);
            border-color: rgba(255,255,255,0.15);
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }

        [data-theme="light"] .score-card:hover {
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        }

        .score-card.highlight {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%);
            border-color: rgba(168, 85, 247, 0.3);
        }

        .score-label {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: var(--text-muted);
            margin-bottom: 15px;
        }

        .score-circle {
            width: 90px;
            height: 90px;
            margin: 0 auto 12px;
            position: relative;
        }

        .score-circle svg {
            transform: rotate(-90deg);
            width: 90px;
            height: 90px;
        }

        .score-circle-bg {
            fill: none;
            stroke: var(--border-color);
            stroke-width: 6;
        }

        .score-circle-progress {
            fill: none;
            stroke-width: 6;
            stroke-linecap: round;
            transition: stroke-dashoffset 1s ease;
        }

        .score-circle-progress.good { stroke: url(#gradient-good); }
        .score-circle-progress.average { stroke: url(#gradient-average); }
        .score-circle-progress.poor { stroke: url(#gradient-poor); }

        .score-value-wrapper {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
        }

        .score-value {
            font-size: 28px;
            font-weight: 700;
            line-height: 1;
        }

        .score-value.good { color: #34d399; }
        .score-value.average { color: #fbbf24; }
        .score-value.poor { color: #f87171; }

        .score-max {
            font-size: 11px;
            color: var(--text-muted);
            display: block;
            margin-top: 2px;
        }

        /* Summary Box */
        .summary-box {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px 30px;
            margin-top: 20px;
        }

        [data-theme="light"] .summary-box {
            background: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }

        .summary-box p {
            font-size: 15px;
            color: var(--text-secondary);
            line-height: 1.7;
        }

        /* Section Styling */
        .section {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 40px;
            margin-bottom: 30px;
        }

        [data-theme="light"] .section {
            background: white;
            box-shadow: 0 2px 20px rgba(0,0,0,0.08);
        }

        .section-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 30px;
        }

        .section-icon {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
        }

        .section-title {
            font-size: 22px;
            font-weight: 700;
        }

        .section-subtitle {
            font-size: 13px;
            color: var(--text-muted);
            margin-top: 4px;
        }

        /* AI Features Grid */
        .ai-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
        }

        .ai-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
            transition: all 0.3s ease;
        }

        [data-theme="light"] .ai-card {
            background: #f8fafc;
        }

        .ai-card:hover {
            background: var(--card-hover);
            border-color: rgba(255,255,255,0.12);
        }

        .ai-card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 16px;
        }

        .ai-card-title {
            font-size: 15px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .ai-card-title span { font-size: 20px; }

        .status-badge {
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-badge.detected {
            background: rgba(52, 211, 153, 0.15);
            color: #34d399;
            border: 1px solid rgba(52, 211, 153, 0.3);
        }

        .status-badge.missing {
            background: rgba(248, 113, 113, 0.15);
            color: #f87171;
            border: 1px solid rgba(248, 113, 113, 0.3);
        }

        .status-badge.partial {
            background: rgba(251, 191, 36, 0.15);
            color: #fbbf24;
            border: 1px solid rgba(251, 191, 36, 0.3);
        }

        .ai-card-desc {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.6;
            margin-bottom: 16px;
        }

        .ai-card-impact {
            font-size: 12px;
            padding: 12px 14px;
            background: rgba(99, 102, 241, 0.1);
            border-radius: 10px;
            border-left: 3px solid #6366f1;
            color: var(--text-secondary);
        }

        .ai-card-impact strong { color: #a5b4fc; }

        /* Action Needed Banner */
        .action-banner {
            background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
            border-radius: 16px;
            padding: 20px 28px;
            display: flex;
            align-items: center;
            gap: 20px;
            margin: 30px 0;
            animation: pulse-border 2s ease-in-out infinite;
            box-shadow: 0 0 30px rgba(220, 38, 38, 0.3);
            color: white;
        }

        @keyframes pulse-border {
            0%, 100% { box-shadow: 0 0 20px rgba(220, 38, 38, 0.3); }
            50% { box-shadow: 0 0 40px rgba(220, 38, 38, 0.5); }
        }

        .action-banner-icon {
            width: 56px;
            height: 56px;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            flex-shrink: 0;
        }

        .action-banner-content h3 {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 6px;
        }

        .action-banner-content p {
            font-size: 14px;
            opacity: 0.9;
        }

        /* Stats Section */
        .stats-section {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin: 30px 0;
        }

        .stat-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        [data-theme="light"] .stat-card {
            background: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #f59e0b, #dc2626);
        }

        .stat-number {
            font-size: 48px;
            font-weight: 800;
            background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            line-height: 1;
            margin-bottom: 12px;
        }

        .stat-text {
            font-size: 14px;
            color: var(--text-secondary);
            line-height: 1.5;
        }

        .stat-source {
            font-size: 10px;
            color: var(--text-muted);
            margin-top: 12px;
        }

        /* Cost Calculator */
        .cost-calculator {
            background: linear-gradient(135deg, rgba(220, 38, 38, 0.15) 0%, rgba(185, 28, 28, 0.1) 100%);
            border: 1px solid rgba(220, 38, 38, 0.3);
            border-radius: 20px;
            padding: 30px;
            margin: 30px 0;
        }

        .cost-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 24px;
        }

        .cost-header-icon {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }

        .cost-header h3 {
            font-size: 20px;
            font-weight: 700;
            color: #fca5a5;
        }

        .cost-header p {
            font-size: 13px;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        .cost-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }

        .cost-item {
            background: rgba(0,0,0,0.3);
            border-radius: 14px;
            padding: 20px;
            text-align: center;
        }

        [data-theme="light"] .cost-item {
            background: rgba(0,0,0,0.05);
        }

        .cost-item-label {
            font-size: 12px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }

        .cost-item-value {
            font-size: 32px;
            font-weight: 800;
            color: #f87171;
        }

        .cost-item-value.highlight { color: #fbbf24; }

        .cost-item-sub {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 4px;
        }

        .cost-total {
            background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
            border-radius: 14px;
            padding: 24px;
            text-align: center;
            color: white;
        }

        .cost-total-label {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            opacity: 0.9;
        }

        .cost-total-value {
            font-size: 42px;
            font-weight: 800;
        }

        .cost-total-sub {
            font-size: 13px;
            opacity: 0.8;
            margin-top: 6px;
        }

        /* Competitor Section */
        .competitor-section {
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%);
            border: 1px solid rgba(245, 158, 11, 0.2);
            border-radius: 20px;
            padding: 30px;
            margin: 30px 0;
        }

        .competitor-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 24px;
        }

        .competitor-header-icon {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }

        .competitor-header h3 {
            font-size: 20px;
            font-weight: 700;
            color: #fcd34d;
        }

        .competitor-header p {
            font-size: 13px;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        .competitor-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
        }

        .competitor-card {
            background: rgba(0,0,0,0.3);
            border-radius: 14px;
            padding: 20px;
            display: flex;
            align-items: flex-start;
            gap: 14px;
        }

        [data-theme="light"] .competitor-card {
            background: rgba(0,0,0,0.05);
        }

        .competitor-card.you { border: 1px solid rgba(248, 113, 113, 0.3); }
        .competitor-card.them { border: 1px solid rgba(52, 211, 153, 0.3); }

        .competitor-avatar {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            flex-shrink: 0;
        }

        .competitor-card.you .competitor-avatar { background: rgba(248, 113, 113, 0.2); }
        .competitor-card.them .competitor-avatar { background: rgba(52, 211, 153, 0.2); }

        .competitor-info h4 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 6px;
        }

        .competitor-card.you .competitor-info h4 { color: #fca5a5; }
        .competitor-card.them .competitor-info h4 { color: #6ee7b7; }

        .competitor-features {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .competitor-features li {
            font-size: 12px;
            color: var(--text-secondary);
            padding: 4px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .competitor-features li::before { font-size: 10px; }
        .competitor-card.you .competitor-features li::before { content: '✗'; color: #f87171; }
        .competitor-card.them .competitor-features li::before { content: '✓'; color: #34d399; }

        /* Time Warning */
        .time-warning {
            background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.1) 100%);
            border: 1px solid rgba(251, 191, 36, 0.3);
            border-left: 4px solid #fbbf24;
            border-radius: 0 14px 14px 0;
            padding: 20px 24px;
            margin: 24px 0;
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .time-warning-icon { font-size: 28px; flex-shrink: 0; }

        .time-warning-content h4 {
            font-size: 15px;
            font-weight: 600;
            color: #fcd34d;
            margin-bottom: 4px;
        }

        .time-warning-content p {
            font-size: 13px;
            color: var(--text-secondary);
        }

        /* Security Grade */
        .security-header {
            display: flex;
            align-items: center;
            gap: 30px;
            padding: 30px;
            background: linear-gradient(135deg, rgba(52, 211, 153, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%);
            border-radius: 16px;
            margin-bottom: 30px;
        }

        .grade-circle {
            width: 100px;
            height: 100px;
            background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
            font-weight: 800;
            box-shadow: 0 10px 40px rgba(52, 211, 153, 0.3);
            color: white;
            flex-shrink: 0;
        }

        .grade-circle.grade-a { background: linear-gradient(135deg, #34d399 0%, #10b981 100%); }
        .grade-circle.grade-b { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); }
        .grade-circle.grade-c { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); }
        .grade-circle.grade-d { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); }
        .grade-circle.grade-f { background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); }

        .grade-info h3 {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .grade-info p {
            font-size: 14px;
            color: var(--text-secondary);
        }

        /* Check Cards */
        .check-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 16px;
        }

        [data-theme="light"] .check-card {
            background: #f8fafc;
        }

        .check-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .check-name {
            font-size: 16px;
            font-weight: 600;
        }

        .check-score {
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }

        .check-score.good {
            background: rgba(52, 211, 153, 0.15);
            color: #34d399;
        }

        .check-score.partial {
            background: rgba(251, 191, 36, 0.15);
            color: #fbbf24;
        }

        .check-score.missing {
            background: rgba(248, 113, 113, 0.15);
            color: #f87171;
        }

        .check-why {
            font-size: 13px;
            color: var(--text-muted);
            font-style: italic;
            padding: 14px 16px;
            background: rgba(0,0,0,0.2);
            border-radius: 10px;
            margin-bottom: 16px;
        }

        [data-theme="light"] .check-why {
            background: rgba(0,0,0,0.05);
        }

        .check-details {
            list-style: none;
            margin-bottom: 16px;
            padding: 0;
        }

        .check-details li {
            font-size: 14px;
            color: var(--text-secondary);
            padding: 6px 0;
        }

        .check-rec {
            font-size: 13px;
            padding: 14px 16px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%);
            border-left: 3px solid #6366f1;
            border-radius: 0 10px 10px 0;
            color: var(--text-secondary);
        }

        .check-rec strong { color: #a5b4fc; }

        /* Performance Metrics */
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
        }

        .metric-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 16px;
            transition: all 0.3s ease;
        }

        [data-theme="light"] .metric-card {
            background: #f8fafc;
        }

        .metric-card:hover {
            background: var(--card-hover);
            transform: translateY(-2px);
        }

        .metric-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .metric-icon.good { background: rgba(52, 211, 153, 0.15); color: #34d399; }
        .metric-icon.average { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
        .metric-icon.poor { background: rgba(248, 113, 113, 0.15); color: #f87171; }

        .metric-info { flex: 1; min-width: 0; }

        .metric-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 4px;
        }

        .metric-desc {
            font-size: 12px;
            color: var(--text-muted);
        }

        .metric-value-box {
            text-align: right;
            padding: 10px 14px;
            border-radius: 10px;
            min-width: 80px;
        }

        .metric-value-box.good {
            background: rgba(52, 211, 153, 0.1);
            border: 1px solid rgba(52, 211, 153, 0.2);
        }

        .metric-value-box.average {
            background: rgba(251, 191, 36, 0.1);
            border: 1px solid rgba(251, 191, 36, 0.2);
        }

        .metric-value-box.poor {
            background: rgba(248, 113, 113, 0.1);
            border: 1px solid rgba(248, 113, 113, 0.2);
        }

        .metric-val {
            display: block;
            font-size: 18px;
            font-weight: 700;
        }

        .metric-value-box.good .metric-val { color: #34d399; }
        .metric-value-box.average .metric-val { color: #fbbf24; }
        .metric-value-box.poor .metric-val { color: #f87171; }

        .metric-target {
            display: block;
            font-size: 10px;
            color: var(--text-muted);
            margin-top: 2px;
        }

        /* Accessibility */
        .a11y-score-header {
            display: flex;
            align-items: center;
            gap: 30px;
            padding: 30px;
            background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%);
            border-radius: 16px;
            margin-bottom: 30px;
        }

        .a11y-score-circle {
            width: 100px;
            height: 100px;
            position: relative;
            flex-shrink: 0;
        }

        .a11y-score-circle svg {
            transform: rotate(-90deg);
            width: 100px;
            height: 100px;
        }

        .a11y-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 24px;
        }

        .a11y-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            border-radius: 12px;
            transition: all 0.3s ease;
        }

        .a11y-item.pass {
            background: rgba(52, 211, 153, 0.08);
            border: 1px solid rgba(52, 211, 153, 0.2);
        }

        .a11y-item.fail {
            background: rgba(248, 113, 113, 0.08);
            border: 1px solid rgba(248, 113, 113, 0.2);
        }

        .a11y-item .a11y-icon {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 700;
            flex-shrink: 0;
        }

        .a11y-item.pass .a11y-icon { background: rgba(52, 211, 153, 0.2); color: #34d399; }
        .a11y-item.fail .a11y-icon { background: rgba(248, 113, 113, 0.2); color: #f87171; }

        .a11y-content { min-width: 0; }

        .a11y-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 2px;
        }

        .a11y-status {
            font-size: 11px;
            color: var(--text-muted);
        }

        .a11y-issues-box {
            background: rgba(248, 113, 113, 0.08);
            border: 1px solid rgba(248, 113, 113, 0.2);
            border-radius: 16px;
            padding: 20px 24px;
        }

        .a11y-issues-header {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 15px;
            font-weight: 600;
            color: #f87171;
            margin-bottom: 14px;
        }

        .a11y-issues-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .a11y-issues-list li {
            font-size: 13px;
            color: var(--text-secondary);
            padding: 8px 0;
            padding-left: 20px;
            position: relative;
            border-bottom: 1px solid var(--border-color);
        }

        .a11y-issues-list li:last-child { border-bottom: none; }
        .a11y-issues-list li::before { content: '•'; position: absolute; left: 0; color: #f87171; }

        /* SEO Section */
        .seo-overview {
            display: grid;
            grid-template-columns: 200px 1fr;
            gap: 30px;
            padding: 30px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%);
            border-radius: 16px;
            margin-bottom: 30px;
        }

        .seo-score-visual { text-align: center; }

        .seo-score-ring {
            width: 140px;
            height: 140px;
            margin: 0 auto 16px;
            position: relative;
        }

        .seo-score-ring svg {
            transform: rotate(-90deg);
            width: 140px;
            height: 140px;
        }

        .seo-score-ring .score-value-wrapper {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }

        .seo-score-ring .score-value { font-size: 42px; }

        .seo-score-label {
            font-size: 14px;
            color: var(--text-secondary);
        }

        .seo-summary h3 {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 12px;
        }

        .seo-summary p {
            font-size: 14px;
            color: var(--text-secondary);
            line-height: 1.6;
            margin-bottom: 16px;
        }

        .seo-quick-stats {
            display: flex;
            gap: 20px;
        }

        .seo-quick-stat {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
        }

        .seo-quick-stat-icon {
            width: 24px;
            height: 24px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }

        .seo-quick-stat-icon.pass { background: rgba(52, 211, 153, 0.2); color: #34d399; }
        .seo-quick-stat-icon.fail { background: rgba(248, 113, 113, 0.2); color: #f87171; }

        .seo-checks-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
        }

        .seo-check-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 14px;
            padding: 20px;
            transition: all 0.3s ease;
        }

        [data-theme="light"] .seo-check-card {
            background: #f8fafc;
        }

        .seo-check-card:hover { background: var(--card-hover); }

        .seo-check-card.pass { border-left: 3px solid #34d399; }
        .seo-check-card.fail { border-left: 3px solid #f87171; }
        .seo-check-card.warning { border-left: 3px solid #fbbf24; }

        .seo-check-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
        }

        .seo-check-title {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .seo-check-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        }

        .seo-check-card.pass .seo-check-icon { background: rgba(52, 211, 153, 0.15); color: #34d399; }
        .seo-check-card.fail .seo-check-icon { background: rgba(248, 113, 113, 0.15); color: #f87171; }
        .seo-check-card.warning .seo-check-icon { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }

        .seo-check-name {
            font-size: 14px;
            font-weight: 600;
        }

        .seo-check-badge {
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .seo-check-card.pass .seo-check-badge { background: rgba(52, 211, 153, 0.15); color: #34d399; }
        .seo-check-card.fail .seo-check-badge { background: rgba(248, 113, 113, 0.15); color: #f87171; }
        .seo-check-card.warning .seo-check-badge { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }

        .seo-check-content {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 12px;
            line-height: 1.5;
        }

        .seo-check-value {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 10px 12px;
            font-size: 12px;
            color: var(--text-secondary);
            font-family: 'Monaco', 'Consolas', monospace;
            word-break: break-all;
            margin-bottom: 12px;
        }

        [data-theme="light"] .seo-check-value {
            background: rgba(0,0,0,0.05);
        }

        .seo-check-value.truncate {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .seo-check-meta {
            display: flex;
            gap: 16px;
            font-size: 11px;
            color: var(--text-muted);
        }

        .seo-check-rec {
            margin-top: 12px;
            padding: 10px 12px;
            background: rgba(248, 113, 113, 0.1);
            border-left: 2px solid #f87171;
            border-radius: 0 8px 8px 0;
            font-size: 12px;
            color: var(--text-secondary);
        }

        .seo-check-rec strong { color: #fca5a5; }

        /* Issues & Quick Wins */
        .issues-grid, .quickwins-grid {
            display: grid;
            gap: 16px;
        }

        .issue-card {
            background: rgba(248, 113, 113, 0.08);
            border: 1px solid rgba(248, 113, 113, 0.2);
            border-left: 4px solid #f87171;
            border-radius: 0 16px 16px 0;
            padding: 20px 24px;
        }

        .issue-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
        }

        .issue-title {
            font-size: 15px;
            font-weight: 600;
        }

        .issue-tag {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .issue-tag.high { background: rgba(248, 113, 113, 0.2); color: #f87171; }
        .issue-tag.medium { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }

        .issue-desc {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.5;
        }

        .quickwin-card {
            background: rgba(52, 211, 153, 0.08);
            border: 1px solid rgba(52, 211, 153, 0.2);
            border-left: 4px solid #34d399;
            border-radius: 0 16px 16px 0;
            padding: 20px 24px;
        }

        .quickwin-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 10px;
        }

        .quickwin-num {
            width: 28px;
            height: 28px;
            background: rgba(52, 211, 153, 0.2);
            color: #34d399;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 700;
            flex-shrink: 0;
        }

        .quickwin-title {
            font-size: 15px;
            font-weight: 600;
        }

        .quickwin-desc {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.5;
            margin-left: 40px;
            margin-bottom: 10px;
        }

        .quickwin-time {
            display: inline-block;
            margin-left: 40px;
            padding: 4px 12px;
            background: rgba(52, 211, 153, 0.15);
            color: #34d399;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
        }

        /* Insight */
        .insight-card {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 16px;
            padding: 30px;
        }

        .insight-card h3 {
            font-size: 18px;
            font-weight: 700;
            color: #a5b4fc;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .insight-card p {
            font-size: 15px;
            color: var(--text-secondary);
            line-height: 1.8;
        }

        /* Footer */
        .footer {
            text-align: center;
            padding: 40px;
            border-top: 1px solid var(--border-color);
            margin-top: 20px;
        }

        .footer-logo {
            font-size: 18px;
            font-weight: 700;
            letter-spacing: 3px;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .footer p {
            font-size: 14px;
            color: var(--text-muted);
        }

        .footer-contact {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
            font-size: 13px;
            color: var(--text-muted);
        }

        /* Responsive */
        @media (max-width: 768px) {
            .scores-grid, .ai-grid { grid-template-columns: 1fr 1fr; }
            .scores-grid.secondary { grid-template-columns: 1fr 1fr 1fr; }
            .section { padding: 24px; }
            .report-title { font-size: 28px; }
            .metrics-grid { grid-template-columns: 1fr; }
            .a11y-grid { grid-template-columns: 1fr 1fr; }
            .a11y-score-header { flex-direction: column; text-align: center; }
            .security-header { flex-direction: column; text-align: center; }
            .stats-section { grid-template-columns: 1fr; }
            .cost-grid { grid-template-columns: 1fr; }
            .competitor-grid { grid-template-columns: 1fr; }
            .action-banner { flex-direction: column; text-align: center; }
            .time-warning { flex-direction: column; text-align: center; }
            .seo-overview { grid-template-columns: 1fr; text-align: center; }
            .seo-checks-grid { grid-template-columns: 1fr; }
            .seo-quick-stats { justify-content: center; }
            .theme-toggle { top: 10px; right: 10px; padding: 6px 12px; font-size: 12px; }
        }

        @media (max-width: 500px) {
            .scores-grid, .scores-grid.secondary { grid-template-columns: 1fr 1fr; }
            .ai-grid { grid-template-columns: 1fr; }
            .a11y-grid { grid-template-columns: 1fr; }
            .stat-number { font-size: 36px; }
            .cost-item-value { font-size: 24px; }
            .cost-total-value { font-size: 32px; }
        }

        @media print {
            body { background: white; }
            .report { box-shadow: none; }
            .theme-toggle { display: none; }
        }

        /* SVG Gradients */
        .svg-defs {
            position: absolute;
            width: 0;
            height: 0;
        }
    </style>
</head>
<body>
<!-- SVG Gradient Definitions -->
<svg class="svg-defs">
    <defs>
        <linearGradient id="gradient-good" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#34d399" />
            <stop offset="100%" style="stop-color:#10b981" />
        </linearGradient>
        <linearGradient id="gradient-average" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#fbbf24" />
            <stop offset="100%" style="stop-color:#f59e0b" />
        </linearGradient>
        <linearGradient id="gradient-poor" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#f87171" />
            <stop offset="100%" style="stop-color:#ef4444" />
        </linearGradient>
    </defs>
</svg>

<!-- Theme Toggle -->
<button class="theme-toggle" onclick="toggleTheme()">
    <span id="theme-icon">☀️</span>
    <span id="theme-text">Light Mode</span>
</button>

<script>
function toggleTheme() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (html.getAttribute('data-theme') === 'dark') {
        html.setAttribute('data-theme', 'light');
        icon.textContent = '🌙';
        text.textContent = 'Dark Mode';
    } else {
        html.setAttribute('data-theme', 'dark');
        icon.textContent = '☀️';
        text.textContent = 'Light Mode';
    }
}
</script>

<div class="report">
    <!-- Header -->
    <div class="header">
        <div class="logo">SECOND CREW</div>
        <div class="badge">2026 AI WEBSITE AUDIT</div>
        <h1 class="report-title">Website Intelligence Report</h1>
        <div class="company-name">${companyName}</div>
        <div class="report-meta">
            <span>${url}</span> · <span>Generated ${today}</span>
        </div>
    </div>

    <!-- Score Cards -->
    <div class="scores-section">
        <div class="scores-grid">
            <div class="score-card">
                <div class="score-label">Mobile Speed</div>
                <div class="score-circle">
                    <svg viewBox="0 0 36 36">
                        <circle class="score-circle-bg" cx="18" cy="18" r="15.5"></circle>
                        <circle class="score-circle-progress ${getScoreClass(scores.mobile)}" cx="18" cy="18" r="15.5"
                                stroke-dasharray="97.4" stroke-dashoffset="${getStrokeDashoffset(scores.mobile)}"></circle>
                    </svg>
                    <div class="score-value-wrapper">
                        <div class="score-value ${getScoreClass(scores.mobile)}">${scores.mobile}</div>
                        <span class="score-max">/100</span>
                    </div>
                </div>
            </div>
            <div class="score-card">
                <div class="score-label">Desktop Speed</div>
                <div class="score-circle">
                    <svg viewBox="0 0 36 36">
                        <circle class="score-circle-bg" cx="18" cy="18" r="15.5"></circle>
                        <circle class="score-circle-progress ${getScoreClass(scores.desktop)}" cx="18" cy="18" r="15.5"
                                stroke-dasharray="97.4" stroke-dashoffset="${getStrokeDashoffset(scores.desktop)}"></circle>
                    </svg>
                    <div class="score-value-wrapper">
                        <div class="score-value ${getScoreClass(scores.desktop)}">${scores.desktop}</div>
                        <span class="score-max">/100</span>
                    </div>
                </div>
            </div>
            <div class="score-card highlight">
                <div class="score-label">AI Readiness</div>
                <div class="score-circle">
                    <svg viewBox="0 0 36 36">
                        <circle class="score-circle-bg" cx="18" cy="18" r="15.5"></circle>
                        <circle class="score-circle-progress ${getScoreClass(scores.aiReadiness)}" cx="18" cy="18" r="15.5"
                                stroke-dasharray="97.4" stroke-dashoffset="${getStrokeDashoffset(scores.aiReadiness)}"></circle>
                    </svg>
                    <div class="score-value-wrapper">
                        <div class="score-value ${getScoreClass(scores.aiReadiness)}">${scores.aiReadiness}</div>
                        <span class="score-max">/100</span>
                    </div>
                </div>
            </div>
            <div class="score-card">
                <div class="score-label">LLM / AEO</div>
                <div class="score-circle">
                    <svg viewBox="0 0 36 36">
                        <circle class="score-circle-bg" cx="18" cy="18" r="15.5"></circle>
                        <circle class="score-circle-progress ${getScoreClass(scores.aeoGeo)}" cx="18" cy="18" r="15.5"
                                stroke-dasharray="97.4" stroke-dashoffset="${getStrokeDashoffset(scores.aeoGeo)}"></circle>
                    </svg>
                    <div class="score-value-wrapper">
                        <div class="score-value ${getScoreClass(scores.aeoGeo)}">${scores.aeoGeo}</div>
                        <span class="score-max">/100</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="scores-grid secondary">
            <div class="score-card">
                <div class="score-label">SEO</div>
                <div class="score-circle">
                    <svg viewBox="0 0 36 36">
                        <circle class="score-circle-bg" cx="18" cy="18" r="15.5"></circle>
                        <circle class="score-circle-progress ${getScoreClass(scores.seo)}" cx="18" cy="18" r="15.5"
                                stroke-dasharray="97.4" stroke-dashoffset="${getStrokeDashoffset(scores.seo)}"></circle>
                    </svg>
                    <div class="score-value-wrapper">
                        <div class="score-value ${getScoreClass(scores.seo)}">${scores.seo}</div>
                        <span class="score-max">/100</span>
                    </div>
                </div>
            </div>
            <div class="score-card">
                <div class="score-label">Security</div>
                <div class="score-circle">
                    <svg viewBox="0 0 36 36">
                        <circle class="score-circle-bg" cx="18" cy="18" r="15.5"></circle>
                        <circle class="score-circle-progress ${getScoreClass(scores.security)}" cx="18" cy="18" r="15.5"
                                stroke-dasharray="97.4" stroke-dashoffset="${getStrokeDashoffset(scores.security)}"></circle>
                    </svg>
                    <div class="score-value-wrapper">
                        <div class="score-value ${getScoreClass(scores.security)}">${scores.security}</div>
                        <span class="score-max">/100</span>
                    </div>
                </div>
            </div>
            <div class="score-card">
                <div class="score-label">Accessibility</div>
                <div class="score-circle">
                    <svg viewBox="0 0 36 36">
                        <circle class="score-circle-bg" cx="18" cy="18" r="15.5"></circle>
                        <circle class="score-circle-progress ${getScoreClass(scores.accessibility)}" cx="18" cy="18" r="15.5"
                                stroke-dasharray="97.4" stroke-dashoffset="${getStrokeDashoffset(scores.accessibility)}"></circle>
                    </svg>
                    <div class="score-value-wrapper">
                        <div class="score-value ${getScoreClass(scores.accessibility)}">${scores.accessibility}</div>
                        <span class="score-max">/100</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="summary-box">
            <p>${aiInsights.executiveSummary}</p>
        </div>

        ${criticalIssues.length > 0 ? `
        <!-- ACTION NEEDED BANNER -->
        <div class="action-banner">
            <div class="action-banner-icon">🚨</div>
            <div class="action-banner-content">
                <h3>Critical: ${criticalIssues.length} Revenue-Blocking Issue${criticalIssues.length > 1 ? 's' : ''} Found</h3>
                <p>Your website is losing potential clients right now. ${criticalIssues.join(', ')} ${criticalIssues.length > 1 ? 'are' : 'is'} costing you leads every day.</p>
            </div>
        </div>
        ` : ''}
    </div>

    <!-- INDUSTRY STATS SECTION -->
    <div class="stats-section">
        <div class="stat-card">
            <div class="stat-number">78%</div>
            <div class="stat-text">of customers hire the <strong>FIRST</strong> business to respond</div>
            <div class="stat-source">Source: Lead Response Study 2024</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">40%</div>
            <div class="stat-text">of searches now go through <strong>AI assistants</strong></div>
            <div class="stat-source">Source: Search Engine Journal 2025</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">67%</div>
            <div class="stat-text">of visitors leave if <strong>no instant response</strong> available</div>
            <div class="stat-source">Source: HubSpot Research 2025</div>
        </div>
    </div>

    <!-- AI Readiness Section -->
    <div class="section">
        <div class="section-header">
            <div class="section-icon">🤖</div>
            <div>
                <h2 class="section-title">2026 AI Readiness Assessment</h2>
                <p class="section-subtitle">How prepared is your website for the AI-first future?</p>
            </div>
        </div>

        <div class="ai-grid">
            <div class="ai-card">
                <div class="ai-card-header">
                    <div class="ai-card-title"><span>💬</span> AI Chatbot</div>
                    <span class="status-badge ${aiReadiness.features.chatbot?.detected ? 'detected' : 'missing'}">${aiReadiness.features.chatbot?.detected ? (aiReadiness.features.chatbot.providers?.join(', ') || 'Detected') : 'Not Found'}</span>
                </div>
                <p class="ai-card-desc">${aiReadiness.features.chatbot?.detected ? `<strong>${aiReadiness.features.chatbot.providers?.join(', ') || 'AI chatbot'}</strong> detected for 24/7 lead qualification.` : 'No AI chatbot detected. Visitors leaving after hours cannot get immediate answers to their questions.'}</p>
                <div class="ai-card-impact"><strong>Impact:</strong> ${aiReadiness.features.chatbot?.detected ? 'Capturing leads around the clock.' : '78% of customers hire the first business to respond.'}</div>
            </div>

            <div class="ai-card">
                <div class="ai-card-header">
                    <div class="ai-card-title"><span>📞</span> AI Voice Agent</div>
                    <span class="status-badge ${aiReadiness.features.voiceAgent?.detected ? 'detected' : 'missing'}">${aiReadiness.features.voiceAgent?.detected ? (aiReadiness.features.voiceAgent.providers?.join(', ') || 'Detected') : 'Not Found'}</span>
                </div>
                <p class="ai-card-desc">${aiReadiness.features.voiceAgent?.detected ? `<strong>${aiReadiness.features.voiceAgent.providers?.join(', ') || 'AI voice agent'}</strong> handles calls when you're unavailable.` : 'After-hours calls go to voicemail. Potential clients calling about urgent matters are moving to competitors.'}</p>
                <div class="ai-card-impact"><strong>Impact:</strong> ${aiReadiness.features.voiceAgent?.detected ? 'Never missing a call.' : 'Weekend and evening leads calling competitors.'}</div>
            </div>

            <div class="ai-card">
                <div class="ai-card-header">
                    <div class="ai-card-title"><span>🧮</span> Quote Calculator</div>
                    <span class="status-badge ${aiReadiness.features.calculator?.detected ? 'detected' : 'missing'}">${aiReadiness.features.calculator?.detected ? (aiReadiness.features.calculator.types?.join(', ') || 'Detected') : 'Not Found'}</span>
                </div>
                <p class="ai-card-desc">${aiReadiness.features.calculator?.detected ? `<strong>${aiReadiness.features.calculator.types?.join(', ') || 'Interactive tool'}</strong> provides instant estimates to visitors.` : 'Using traditional contact form. Visitors want instant pricing estimates for services.'}</p>
                <div class="ai-card-impact"><strong>Impact:</strong> ${aiReadiness.features.calculator?.detected ? 'Converting visitors with instant value.' : 'AI calculators convert 3x better than forms.'}</div>
            </div>

            <div class="ai-card">
                <div class="ai-card-header">
                    <div class="ai-card-title"><span>🔍</span> LLM Optimization</div>
                    <span class="status-badge ${scores.aeoGeo >= 60 ? 'detected' : scores.aeoGeo >= 40 ? 'partial' : 'missing'}">${scores.aeoGeo >= 60 ? 'Optimized' : scores.aeoGeo >= 40 ? 'Needs Work' : 'Not Optimized'}</span>
                </div>
                <p class="ai-card-desc">${scores.aeoGeo >= 60 ? 'Site structured for AI assistants to understand and recommend.' : 'Limited structured data. AI assistants may not recommend this business for queries.'}</p>
                <div class="ai-card-impact"><strong>Impact:</strong> ${aiInsights.llmRecommendation}</div>
            </div>
        </div>

        <!-- TIME SENSITIVE WARNING -->
        <div class="time-warning">
            <div class="time-warning-icon">⏰</div>
            <div class="time-warning-content">
                <h4>Time-Sensitive: AI Search Is Already Here</h4>
                <p>Google's AI Overviews launched in 2024. ChatGPT has 200M+ weekly users. Sites not optimized for AI are already losing visibility to competitors who are.</p>
            </div>
        </div>
    </div>

    <!-- COMPETITOR COMPARISON -->
    <div class="competitor-section">
        <div class="competitor-header">
            <div class="competitor-header-icon">⚔️</div>
            <div>
                <h3>While You Wait, Competitors Are Winning</h3>
                <p>Here's what modern ${industry} businesses in ${city} are doing differently</p>
            </div>
        </div>

        <div class="competitor-grid">
            <div class="competitor-card you">
                <div class="competitor-avatar">🏢</div>
                <div class="competitor-info">
                    <h4>Your Website (Current)</h4>
                    <ul class="competitor-features">
                        <li>No 24/7 lead capture</li>
                        <li>Calls go to voicemail after hours</li>
                        <li>Contact form only (low conversion)</li>
                        <li>Not optimized for AI search</li>
                    </ul>
                </div>
            </div>
            <div class="competitor-card them">
                <div class="competitor-avatar">🏆</div>
                <div class="competitor-info">
                    <h4>AI-Ready Competitors</h4>
                    <ul class="competitor-features">
                        <li>AI chatbot qualifies leads 24/7</li>
                        <li>AI voice agent answers every call</li>
                        <li>Instant quote calculators</li>
                        <li>ChatGPT recommends them</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>

    <!-- LLM Optimization Section -->
    <div class="section">
        <div class="section-header">
            <div class="section-icon">🧠</div>
            <div>
                <h2 class="section-title">LLM Optimization Deep Dive (AEO/GEO)</h2>
                <p class="section-subtitle">What AI assistants like ChatGPT, Perplexity, and Google AI look for when recommending businesses</p>
            </div>
        </div>

        ${aeoGeoAnalysis.detailedChecks ? aeoGeoAnalysis.detailedChecks.map(check => `
        <div class="check-card">
            <div class="check-header">
                <div class="check-name">${check.name}</div>
                <span class="check-score ${check.status}">${check.score}/${check.maxScore} pts</span>
            </div>
            <div class="check-why">💡 Why it matters: ${check.whyItMatters}</div>
            <ul class="check-details">
                ${check.details.map(d => `<li>${d}</li>`).join('')}
            </ul>
            ${check.recommendation ? `<div class="check-rec"><strong>Recommendation:</strong> ${check.recommendation}</div>` : ''}
        </div>
        `).join('') : ''}

        <div class="insight-card" style="margin-top: 24px;">
            <h3>🔮 AI Recommendation Prediction</h3>
            <p><strong>Query:</strong> "${aeoGeoAnalysis.llmContext?.testQuery || `Best ${industry} in ${city}`}"</p>
            <p style="margin-top: 10px;"><strong>Result:</strong> ${aeoGeoAnalysis.llmContext?.prediction || (scores.aeoGeo >= 60 ? 'Likely to be recommended by AI assistants' : 'Improvements needed for AI recommendations')}</p>
        </div>
    </div>

    <!-- Performance Metrics Section -->
    <div class="section">
        <div class="section-header">
            <div class="section-icon">⚡</div>
            <div>
                <h2 class="section-title">Performance Metrics</h2>
                <p class="section-subtitle">Core Web Vitals that impact user experience and SEO rankings</p>
            </div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-icon ${parseFloat(performanceMetrics.firstContentfulPaint) < 1.8 ? 'good' : parseFloat(performanceMetrics.firstContentfulPaint) < 3 ? 'average' : 'poor'}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                </div>
                <div class="metric-info">
                    <div class="metric-name">First Contentful Paint</div>
                    <div class="metric-desc">When visitors first see content</div>
                </div>
                <div class="metric-value-box ${parseFloat(performanceMetrics.firstContentfulPaint) < 1.8 ? 'good' : parseFloat(performanceMetrics.firstContentfulPaint) < 3 ? 'average' : 'poor'}">
                    <span class="metric-val">${performanceMetrics.firstContentfulPaint}</span>
                    <span class="metric-target">Target: &lt;1.8s</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-icon ${parseFloat(performanceMetrics.largestContentfulPaint) < 2.5 ? 'good' : parseFloat(performanceMetrics.largestContentfulPaint) < 4 ? 'average' : 'poor'}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                </div>
                <div class="metric-info">
                    <div class="metric-name">Largest Contentful Paint</div>
                    <div class="metric-desc">When main content loads</div>
                </div>
                <div class="metric-value-box ${parseFloat(performanceMetrics.largestContentfulPaint) < 2.5 ? 'good' : parseFloat(performanceMetrics.largestContentfulPaint) < 4 ? 'average' : 'poor'}">
                    <span class="metric-val">${performanceMetrics.largestContentfulPaint}</span>
                    <span class="metric-target">Target: &lt;2.5s</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-icon ${parseFloat(performanceMetrics.timeToInteractive) < 3.8 ? 'good' : parseFloat(performanceMetrics.timeToInteractive) < 7.3 ? 'average' : 'poor'}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </div>
                <div class="metric-info">
                    <div class="metric-name">Time to Interactive</div>
                    <div class="metric-desc">When users can interact</div>
                </div>
                <div class="metric-value-box ${parseFloat(performanceMetrics.timeToInteractive) < 3.8 ? 'good' : parseFloat(performanceMetrics.timeToInteractive) < 7.3 ? 'average' : 'poor'}">
                    <span class="metric-val">${performanceMetrics.timeToInteractive}</span>
                    <span class="metric-target">Target: &lt;3.8s</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-icon ${parseFloat(performanceMetrics.totalBlockingTime) < 200 ? 'good' : parseFloat(performanceMetrics.totalBlockingTime) < 600 ? 'average' : 'poor'}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                </div>
                <div class="metric-info">
                    <div class="metric-name">Total Blocking Time</div>
                    <div class="metric-desc">JavaScript execution delays</div>
                </div>
                <div class="metric-value-box ${parseFloat(performanceMetrics.totalBlockingTime) < 200 ? 'good' : parseFloat(performanceMetrics.totalBlockingTime) < 600 ? 'average' : 'poor'}">
                    <span class="metric-val">${performanceMetrics.totalBlockingTime}</span>
                    <span class="metric-target">Target: &lt;200ms</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-icon ${parseFloat(performanceMetrics.cumulativeLayoutShift) < 0.1 ? 'good' : parseFloat(performanceMetrics.cumulativeLayoutShift) < 0.25 ? 'average' : 'poor'}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                        <line x1="8" y1="21" x2="16" y2="21"></line>
                        <line x1="12" y1="17" x2="12" y2="21"></line>
                    </svg>
                </div>
                <div class="metric-info">
                    <div class="metric-name">Cumulative Layout Shift</div>
                    <div class="metric-desc">Visual stability score</div>
                </div>
                <div class="metric-value-box ${parseFloat(performanceMetrics.cumulativeLayoutShift) < 0.1 ? 'good' : parseFloat(performanceMetrics.cumulativeLayoutShift) < 0.25 ? 'average' : 'poor'}">
                    <span class="metric-val">${performanceMetrics.cumulativeLayoutShift}</span>
                    <span class="metric-target">Target: &lt;0.1</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-icon ${parseFloat(performanceMetrics.speedIndex) < 3.4 ? 'good' : parseFloat(performanceMetrics.speedIndex) < 5.8 ? 'average' : 'poor'}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                </div>
                <div class="metric-info">
                    <div class="metric-name">Speed Index</div>
                    <div class="metric-desc">How quickly content is visible</div>
                </div>
                <div class="metric-value-box ${parseFloat(performanceMetrics.speedIndex) < 3.4 ? 'good' : parseFloat(performanceMetrics.speedIndex) < 5.8 ? 'average' : 'poor'}">
                    <span class="metric-val">${performanceMetrics.speedIndex}</span>
                    <span class="metric-target">Target: &lt;3.4s</span>
                </div>
            </div>
        </div>
    </div>

    <!-- On-Site SEO Section -->
    <div class="section">
        <div class="section-header">
            <div class="section-icon">🔍</div>
            <div>
                <h2 class="section-title">On-Site SEO Analysis</h2>
                <p class="section-subtitle">Technical SEO factors that impact your search engine rankings</p>
            </div>
        </div>

        <div class="seo-overview">
            <div class="seo-score-visual">
                <div class="seo-score-ring">
                    <svg viewBox="0 0 36 36">
                        <circle class="score-circle-bg" cx="18" cy="18" r="15.5" stroke-width="3"></circle>
                        <circle class="score-circle-progress ${getScoreClass(scores.seo)}" cx="18" cy="18" r="15.5"
                                stroke-dasharray="97.4" stroke-dashoffset="${getStrokeDashoffset(scores.seo)}" stroke-width="3"></circle>
                    </svg>
                    <div class="score-value-wrapper">
                        <div class="score-value ${getScoreClass(scores.seo)}">${scores.seo}</div>
                    </div>
                </div>
                <div class="seo-score-label">SEO Score</div>
            </div>
            <div class="seo-summary">
                <h3>${scores.seo >= 80 ? 'Excellent SEO Foundation' : scores.seo >= 60 ? 'Good Foundation, Room for Improvement' : 'SEO Needs Attention'}</h3>
                <p>${scores.seo >= 80 ? 'Your website has strong SEO elements in place. Keep optimizing to stay ahead of competitors.' : scores.seo >= 60 ? 'Your website has the essential SEO elements in place, but there are opportunities to strengthen your search visibility.' : 'There are critical SEO issues that need to be addressed to improve your search visibility.'}</p>
                <div class="seo-quick-stats">
                    <div class="seo-quick-stat">
                        <span class="seo-quick-stat-icon pass">✓</span>
                        <span>${seoAnalysis.passedChecks || 0} Checks Passed</span>
                    </div>
                    <div class="seo-quick-stat">
                        <span class="seo-quick-stat-icon fail">!</span>
                        <span>${seoAnalysis.failedChecks || 0} Issues Found</span>
                    </div>
                </div>
            </div>
        </div>

        ${seoAnalysis.detailedChecks ? `
        <div class="seo-checks-grid">
            ${seoAnalysis.detailedChecks.map(check => `
            <div class="seo-check-card ${check.status}">
                <div class="seo-check-header">
                    <div class="seo-check-title">
                        <div class="seo-check-icon">${check.icon || '📝'}</div>
                        <span class="seo-check-name">${check.name}</span>
                    </div>
                    <span class="seo-check-badge">${check.badge}</span>
                </div>
                <div class="seo-check-content">${check.description}</div>
                ${check.value ? `<div class="seo-check-value ${check.truncate ? 'truncate' : ''}">${check.value}</div>` : ''}
                ${check.meta ? `<div class="seo-check-meta">${check.meta.map(m => `<span>${m}</span>`).join('')}</div>` : ''}
                ${check.recommendation ? `<div class="seo-check-rec"><strong>Fix:</strong> ${check.recommendation}</div>` : ''}
            </div>
            `).join('')}
        </div>
        ` : ''}
    </div>

    <!-- Accessibility Section -->
    <div class="section">
        <div class="section-header">
            <div class="section-icon">♿</div>
            <div>
                <h2 class="section-title">Accessibility Check</h2>
                <p class="section-subtitle">Ensuring your website works for everyone, including people with disabilities</p>
            </div>
        </div>

        <div class="a11y-score-header">
            <div class="a11y-score-circle">
                <svg viewBox="0 0 36 36">
                    <circle class="score-circle-bg" cx="18" cy="18" r="15.5"></circle>
                    <circle class="score-circle-progress ${getScoreClass(scores.accessibility)}" cx="18" cy="18" r="15.5"
                            stroke-dasharray="97.4" stroke-dashoffset="${getStrokeDashoffset(scores.accessibility)}"></circle>
                </svg>
                <div class="score-value-wrapper">
                    <div class="score-value ${getScoreClass(scores.accessibility)}">${scores.accessibility}</div>
                </div>
            </div>
            <div class="a11y-score-info" style="flex: 1;">
                <h3>Accessibility Score</h3>
                <p>${scores.accessibility >= 90 ? 'Excellent accessibility! Your site works well for users with disabilities.' : scores.accessibility >= 70 ? 'Good accessibility with some issues that may prevent people with disabilities from using it effectively.' : 'Your site has accessibility issues that need attention for legal compliance and user experience.'}</p>
            </div>
        </div>

        <div class="a11y-grid">
            <div class="a11y-item ${accessibilityAnalysis.checks.altText ? 'pass' : 'fail'}">
                <div class="a11y-icon">${accessibilityAnalysis.checks.altText ? '✓' : '✗'}</div>
                <div class="a11y-content">
                    <div class="a11y-label">Image Alt Text</div>
                    <div class="a11y-status">${accessibilityAnalysis.checks.altText ? 'All images have descriptions' : 'Missing alt text'}</div>
                </div>
            </div>

            <div class="a11y-item ${accessibilityAnalysis.checks.headingHierarchy ? 'pass' : 'fail'}">
                <div class="a11y-icon">${accessibilityAnalysis.checks.headingHierarchy ? '✓' : '✗'}</div>
                <div class="a11y-content">
                    <div class="a11y-label">Heading Structure</div>
                    <div class="a11y-status">${accessibilityAnalysis.checks.headingHierarchy ? 'Proper H1-H6 hierarchy' : 'Heading issues found'}</div>
                </div>
            </div>

            <div class="a11y-item ${accessibilityAnalysis.checks.formLabels ? 'pass' : 'fail'}">
                <div class="a11y-icon">${accessibilityAnalysis.checks.formLabels ? '✓' : '✗'}</div>
                <div class="a11y-content">
                    <div class="a11y-label">Form Labels</div>
                    <div class="a11y-status">${accessibilityAnalysis.checks.formLabels ? 'All inputs properly labeled' : 'Labels missing'}</div>
                </div>
            </div>

            <div class="a11y-item ${accessibilityAnalysis.checks.skipLinks ? 'pass' : 'fail'}">
                <div class="a11y-icon">${accessibilityAnalysis.checks.skipLinks ? '✓' : '✗'}</div>
                <div class="a11y-content">
                    <div class="a11y-label">Skip Navigation</div>
                    <div class="a11y-status">${accessibilityAnalysis.checks.skipLinks ? 'Skip link present' : 'No skip link found'}</div>
                </div>
            </div>

            <div class="a11y-item ${accessibilityAnalysis.checks.ariaLandmarks ? 'pass' : 'fail'}">
                <div class="a11y-icon">${accessibilityAnalysis.checks.ariaLandmarks ? '✓' : '✗'}</div>
                <div class="a11y-content">
                    <div class="a11y-label">ARIA Landmarks</div>
                    <div class="a11y-status">${accessibilityAnalysis.checks.ariaLandmarks ? 'Page regions defined' : 'Missing landmarks'}</div>
                </div>
            </div>

            <div class="a11y-item ${accessibilityAnalysis.checks.langAttribute ? 'pass' : 'fail'}">
                <div class="a11y-icon">${accessibilityAnalysis.checks.langAttribute ? '✓' : '✗'}</div>
                <div class="a11y-content">
                    <div class="a11y-label">Language Attribute</div>
                    <div class="a11y-status">${accessibilityAnalysis.checks.langAttribute ? 'Page language specified' : 'Language not set'}</div>
                </div>
            </div>
        </div>

        ${accessibilityAnalysis.issues.length > 0 ? `
        <div class="a11y-issues-box">
            <div class="a11y-issues-header">
                <span>⚠️</span>
                <span>Issues Found</span>
            </div>
            <ul class="a11y-issues-list">
                ${accessibilityAnalysis.issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
    </div>

    <!-- Security Section -->
    <div class="section">
        <div class="section-header">
            <div class="section-icon">🔒</div>
            <div>
                <h2 class="section-title">Security Analysis</h2>
                <p class="section-subtitle">Protecting your clients' data and your reputation</p>
            </div>
        </div>

        <div class="security-header">
            <div class="grade-circle grade-${(securityAnalysis.grade || 'c').toLowerCase()}">${securityAnalysis.grade || 'C'}</div>
            <div class="grade-info">
                <h3>Security Grade: ${securityAnalysis.grade || 'C'}</h3>
                <p>${securityAnalysis.summary || 'Security assessment complete. See details below.'}</p>
            </div>
        </div>

        ${securityAnalysis.detailedChecks ? securityAnalysis.detailedChecks.map(check => `
        <div class="check-card">
            <div class="check-header">
                <div class="check-name">${check.name}</div>
                <span class="check-score ${check.status}">${check.score}/${check.maxScore} pts</span>
            </div>
            <div class="check-why">🛡️ Why it matters: ${check.whyItMatters}</div>
            <ul class="check-details">
                ${check.details.map(d => `<li>${d}</li>`).join('')}
            </ul>
            ${check.recommendation ? `<div class="check-rec"><strong>Recommendation:</strong> ${check.recommendation}</div>` : ''}
        </div>
        `).join('') : ''}
    </div>

    <!-- Issues Section -->
    <div class="section">
        <div class="section-header">
            <div class="section-icon">⚠️</div>
            <div>
                <h2 class="section-title">Top Issues Affecting Your Business</h2>
                <p class="section-subtitle">Priority items that need attention</p>
            </div>
        </div>

        <div class="issues-grid">
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
    </div>

    <!-- Quick Wins Section -->
    <div class="section">
        <div class="section-header">
            <div class="section-icon">✅</div>
            <div>
                <h2 class="section-title">Quick Wins You Can Do Today</h2>
                <p class="section-subtitle">Low-effort, high-impact improvements</p>
            </div>
        </div>

        <div class="quickwins-grid">
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
    </div>

    <!-- Industry Insight Section -->
    <div class="section">
        <div class="section-header">
            <div class="section-icon">💡</div>
            <div>
                <h2 class="section-title">2026 ${industry} Insight</h2>
                <p class="section-subtitle">What this means for your business</p>
            </div>
        </div>

        <div class="insight-card">
            <h3>🎯 What This Means for Your Business</h3>
            <p>${aiInsights.industryInsight}</p>
        </div>
    </div>

    <!-- Footer -->
    <div class="footer">
        <div class="footer-logo">SECOND CREW</div>
        <p>Questions about this report? Just reply to this email.</p>
        <div class="footer-contact">
            Alex Murillo · Second Crew · secondcrew.com
        </div>
    </div>
</div>
</body>
</html>`;
}

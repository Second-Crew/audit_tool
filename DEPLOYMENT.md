# Second Crew Report Generator - Vercel Deployment Guide

## Quick Deploy to Vercel (5 minutes)

### Step 1: Push to GitHub

1. Create a new GitHub repository (public or private)
2. Upload all the project files to the repository

### Step 2: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Vercel will auto-detect Next.js - keep the default settings
5. Add your environment variable:
   - Click **"Environment Variables"**
   - Add: `GEMINI_API_KEY` = `your-gemini-api-key`
6. Click **"Deploy"**

That's it! Your report generator will be live in about 2 minutes.

---

## Getting Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key and paste it in Vercel's environment variables

**Note:** Gemini API has a generous free tier - perfect for 50-200 reports/month.

---

## Project Structure

```
secondcrew-report-generator/
├── app/
│   ├── api/
│   │   └── analyze/
│   │       └── route.js    # Main analysis API
│   ├── layout.js           # Root layout
│   ├── page.js             # Main UI
│   └── globals.css         # Tailwind styles
├── .env.example            # Environment template
├── next.config.js          # Next.js config
├── package.json            # Dependencies
├── postcss.config.js       # PostCSS config
└── tailwind.config.js      # Tailwind config
```

---

## What the Report Includes

### Performance Analysis
- Mobile speed score (Google PageSpeed)
- Desktop speed score
- Core Web Vitals (FCP, LCP, CLS, TBT)

### AI Readiness Assessment
- Chatbot detection (Intercom, Drift, Tidio, etc.)
- Voice agent detection (Vapi, Bland.ai, etc.)
- Quote calculator detection
- LLM optimization score

### AEO/GEO Analysis (LLM Optimization)
- Schema markup check
- FAQ content detection
- Local business signals
- E-E-A-T indicators
- Structured content analysis

### SEO Analysis
- Title and meta description
- H1 heading structure
- Schema markup
- HTTPS security
- Canonical URLs
- Open Graph tags

### Security Check
- HTTPS status
- Security headers (HSTS, CSP, X-Frame-Options)

### Accessibility Check
- Image alt text
- Heading hierarchy
- Form labels
- ARIA landmarks
- Skip navigation
- Language attribute

---

## Customization

### Change Branding
Edit the `generateReportHTML` function in `app/api/analyze/route.js`:
- Logo text (line ~989)
- Colors in CSS
- Footer contact info (line ~1133)

### Add More Industries
Edit the `industries` array in `app/page.js` (line ~15)

### Modify Analysis Logic
All analysis functions are in `app/api/analyze/route.js`:
- `analyzeAIReadiness()` - AI feature detection
- `analyzeAEOGEO()` - LLM optimization scoring
- `analyzeSEO()` - SEO checks
- `analyzeAccessibility()` - Accessibility audit
- `analyzeSecurityHeaders()` - Security analysis

---

## Troubleshooting

### "Analysis failed" error
- Check that the URL is valid and publicly accessible
- Some sites block automated requests - try a different site

### Slow report generation
- Reports typically take 10-20 seconds
- Google PageSpeed API can be slow during peak times

### Missing Gemini insights
- Check your API key is set correctly in Vercel
- Verify you haven't exceeded API limits

---

## Support

Questions about the code or deployment?
Contact: Alex Murillo | Second Crew | secondcrew.com

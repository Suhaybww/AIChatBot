import axios from 'axios';
import * as cheerio from 'cheerio';

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  url: string;
  source: 'web' | 'knowledge_base' | 'rmit_official';
  relevanceScore: number;
  searchQuery: string;
  timestamp: Date;
  metadata?: {
    courseCode?: string;
    programType?: string;
    faculty?: string;
    duration?: string;
    campus?: string;
  };
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  totalResults: number;
  searchTime: number;
  sources: {
    web: number;
    knowledge_base: number;
    rmit_official: number;
  };
}

interface CachedSearchResult {
  results: SearchResult[];
  timestamp: number;
  expiresAt: number;
}

export class SearchService {
  private readonly MAX_RESULTS = 10;
  private readonly SEARCH_TIMEOUT = 8000; // Further reduced to 8 seconds
  private readonly MIN_RELEVANCE_SCORE = 0.2;
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  
  private searchCache = new Map<string, CachedSearchResult>();

  // Comprehensive abbreviation map for RMIT terms
  private readonly abbreviationMap: Record<string, string[]> = {
    'bach': ['bachelor', 'undergraduate', 'bachelors'],
    'bac': ['bachelor', 'undergraduate', 'bachelors'],
    'master': ['masters', 'postgraduate', 'graduate'],
    'masters': ['master', 'postgraduate', 'graduate'],
    'phd': ['doctor of philosophy', 'doctorate', 'doctoral'],
    'cert': ['certificate', 'certification'],
    'dip': ['diploma', 'advanced diploma'],
    'eng': ['engineering'],
    'bus': ['business'],
    'edu': ['education', 'teaching'],
    'sci': ['science', 'sciences'],
    'tech': ['technology', 'technical'],
    'it': ['information technology', 'information systems'],
    'cs': ['computer science', 'computing'],
    'ai': ['artificial intelligence', 'machine learning'],
    'des': ['design'],
    'arch': ['architecture', 'architectural'],
    'med': ['medicine', 'medical', 'health'],
    'law': ['legal studies', 'legal'],
    'comm': ['communication', 'media'],
    'art': ['arts', 'creative arts', 'fine arts'],
    'rmit': ['rmit university', 'royal melbourne institute of technology']
  };

  // Program type patterns for better categorization
  private readonly programTypePatterns = {
    undergraduate: ['bachelor', 'undergraduate', 'honours'],
    postgraduate: ['master', 'graduate certificate', 'graduate diploma', 'postgraduate'],
    research: ['phd', 'doctorate', 'research', 'mphil'],
    vocational: ['certificate', 'diploma', 'advanced diploma', 'associate degree'],
    short: ['short course', 'professional development', 'single course']
  };

  async performSearch(
    query: string,
    includeWeb: boolean = true,
    includeKnowledgeBase: boolean = true
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    
    console.log('🔍 Starting comprehensive RMIT search for:', query);
    
    // Extract search intent and terms
    const searchIntent = this.analyzeSearchIntent(query);
    const enhancedTerms = this.extractEnhancedSearchTerms(query, searchIntent);
    console.log('📝 Search intent:', searchIntent);
    console.log('📝 Enhanced terms:', enhancedTerms);

    const searchPromises: Promise<SearchResult[]>[] = [];

    if (includeKnowledgeBase) {
      console.log('📚 Searching RMIT knowledge base...');
      searchPromises.push(this.searchKnowledgeBase(query, enhancedTerms));
    }

    if (includeWeb) {
      console.log('🌐 Searching RMIT website...');
      searchPromises.push(this.performRMITWebSearch(query, enhancedTerms, searchIntent));
    }

    try {
      console.log(`⏱️ Starting ${searchPromises.length} search operations with ${this.SEARCH_TIMEOUT}ms timeout`);
      
      const searchResults = await Promise.allSettled(
        searchPromises.map((promise, index) => 
          Promise.race([
            promise,
            this.createTimeoutPromise()
          ]).catch(error => {
            console.error(`❌ Search operation ${index} failed:`, error.message);
            throw error;
          })
        )
      );

      const allResults: SearchResult[] = [];
      searchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          console.log(`✅ Search source ${index} returned ${result.value.length} results`);
          allResults.push(...result.value);
        } else {
          console.log(`❌ Search source ${index} failed:`, result.status === 'rejected' ? result.reason : 'Unknown error');
        }
      });

      // Process and rank results
      const uniqueResults = this.deduplicateResults(allResults);
      const enrichedResults = this.enrichResults(uniqueResults, query, enhancedTerms);
      const rankedResults = this.rankResults(enrichedResults, query, searchIntent);
      const topResults = rankedResults.slice(0, this.MAX_RESULTS);

      const sources = {
        web: topResults.filter(r => r.source === 'web').length,
        knowledge_base: topResults.filter(r => r.source === 'knowledge_base').length,
        rmit_official: topResults.filter(r => r.source === 'rmit_official').length,
      };

      const searchTime = Date.now() - startTime;
      console.log(`🎯 Search completed: ${topResults.length} results in ${searchTime}ms`);

      return {
        results: topResults,
        query,
        totalResults: topResults.length,  // Use actual returned results count, not total found
        searchTime,
        sources
      };

    } catch (error) {
      console.error('❌ Search error:', error);
      
      // Always include both knowledge base AND basic web results
      console.log('🔄 Generating fallback results with basic web search...');
      const allResults: SearchResult[] = [];
      
      try {
        // Get knowledge base results
        const kbResults = await this.searchKnowledgeBase(query, enhancedTerms);
        allResults.push(...kbResults.slice(0, 3));
        
        // Add basic web results
        const basicWebResults = await this.performBasicRMITSearch(query);
        allResults.push(...basicWebResults);
        
        const sources = {
          web: basicWebResults.length,
          knowledge_base: kbResults.length,
          rmit_official: basicWebResults.length
        };
        
        const limitedResults = allResults.slice(0, this.MAX_RESULTS);
        return {
          results: limitedResults,
          query,
          totalResults: limitedResults.length,  // Use actual returned results count
          searchTime: Date.now() - startTime,
          sources
        };
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
        
        // Last resort: return basic RMIT results
        const emergencyResults = await this.performBasicRMITSearch(query);
        return {
          results: emergencyResults,
          query,
          totalResults: emergencyResults.length,
          searchTime: Date.now() - startTime,
          sources: { web: emergencyResults.length, knowledge_base: 0, rmit_official: emergencyResults.length }
        };
      }
    }
  }

  private analyzeSearchIntent(query: string): {
    type: 'program' | 'general' | 'policy' | 'service' | 'contact' | 'dates';
    programLevel?: string;
    isUrlRequest: boolean;
    isSpecificRequest: boolean;
  } {
    const queryLower = query.toLowerCase();
    
    // Check if user wants a URL/link
    const urlPatterns = ['link', 'url', 'website', 'page', 'site', 'find me', 'where can i find', 'show me'];
    const isUrlRequest = urlPatterns.some(pattern => queryLower.includes(pattern));
    
    // Check if it's a specific request
    const specificPatterns = ['specific', 'particular', 'exact', 'precisely'];
    const isSpecificRequest = specificPatterns.some(pattern => queryLower.includes(pattern));
    
    // Determine query type
    let type: 'program' | 'general' | 'policy' | 'service' | 'contact' | 'dates' = 'general';
    let programLevel: string | undefined;
    
    // Program search patterns
    for (const [level, patterns] of Object.entries(this.programTypePatterns)) {
      if (patterns.some(pattern => queryLower.includes(pattern))) {
        type = 'program';
        programLevel = level;
        break;
      }
    }
    
    // Other search types
    if (queryLower.includes('policy') || queryLower.includes('regulation')) {
      type = 'policy';
    } else if (queryLower.includes('service') || queryLower.includes('support')) {
      type = 'service';
    } else if (queryLower.includes('contact') || queryLower.includes('phone') || queryLower.includes('email')) {
      type = 'contact';
    } else if (queryLower.includes('date') || queryLower.includes('deadline') || queryLower.includes('when')) {
      type = 'dates';
    }
    
    return { type, programLevel, isUrlRequest, isSpecificRequest };
  }

  private async performRMITWebSearch(
    query: string, 
    _enhancedTerms: string[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _searchIntent: ReturnType<typeof this.analyzeSearchIntent>
  ): Promise<SearchResult[]> {
    const cacheKey = `rmit_web_${query.toLowerCase()}`;
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      console.log('💾 Using cached RMIT web results');
      return cached;
    }

    try {
      // Use fast search API instead of slow scraping
      console.log('🚀 Using fast search API for RMIT...');
      const searchResults = await this.performFastSearch(query, _enhancedTerms);
      
      if (searchResults.length > 0) {
        this.setCachedResult(cacheKey, searchResults);
      }

      console.log(`✅ Fast search found ${searchResults.length} RMIT results`);
      return searchResults.slice(0, 15);
      
    } catch (error) {
      console.error('❌ Fast search failed, falling back to basic search:', error);
      
      // Fallback to simple search
      try {
        const fallbackResults = await this.performBasicRMITSearch(query);
        return fallbackResults;
      } catch (fallbackError) {
        console.error('❌ Fallback search also failed:', fallbackError);
        return [];
      }
    }
  }

  private async performFastSearch(
    query: string, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _enhancedTerms: string[]
  ): Promise<SearchResult[]> {
    const searchQuery = `${query} site:rmit.edu.au`;
    
    try {
      // Use a fast search service (you'll need to add SERPER_API_KEY to your .env)
      const serperKey = process.env.SERPER_API_KEY;
      
      if (serperKey) {
        console.log('🔍 Using Serper.dev for fast search...');
        return await this.searchWithSerper(searchQuery, serperKey);
      } else {
        console.log('🔍 No search API key, using basic search...');
        return await this.performBasicRMITSearch(query);
      }
    } catch (error) {
      console.error('Fast search error:', error);
      return [];
    }
  }

  private async searchWithSerper(query: string, apiKey: string): Promise<SearchResult[]> {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        num: 10,
        hl: 'en',
        gl: 'au' // Australia region
      }),
    });

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status}`);
    }

    const data = await response.json();
    const results: SearchResult[] = [];

    if (data.organic) {
      data.organic.forEach((item: {title?: string; snippet?: string; link?: string}, index: number) => {
        if (item.link && item.link.includes('rmit.edu.au')) {
          results.push({
            id: `serper_${index}`,
            title: item.title || 'RMIT Resource',
            content: item.snippet || item.title || '',
            url: item.link,
            source: 'rmit_official',
            relevanceScore: Math.max(0.8 - (index * 0.05), 0.3), // Higher scores for top results
            searchQuery: query,
            timestamp: new Date()
          });
        }
      });
    }

    return results;
  }

  private async performBasicRMITSearch(query: string): Promise<SearchResult[]> {
    // Fast, comprehensive fallback search with pre-defined RMIT resources
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    
    console.log('🔗 Generating basic RMIT links for query...');
    
    // Canvas and online systems
    if (queryLower.includes('canvas') || queryLower.includes('online') || queryLower.includes('systems') || queryLower.includes('access')) {
      results.push({
        id: 'basic_canvas',
        title: 'RMIT Students - Online Systems & Canvas',
        content: 'Access Canvas LMS, myRMIT student portal, email, and other essential online systems for RMIT students.',
        url: 'https://www.rmit.edu.au/students',
        source: 'rmit_official',
        relevanceScore: 0.95,
        searchQuery: query,
        timestamp: new Date()
      });
      
      results.push({
        id: 'basic_myrmit',
        title: 'myRMIT Student Portal (Requires Login)',
        content: 'Your gateway to all RMIT online services including Canvas, course enrollment, and student information.',
        url: 'https://my.rmit.edu.au',
        source: 'rmit_official',
        relevanceScore: 0.9,
        searchQuery: query,
        timestamp: new Date()
      });
    }
    
    // Programs and courses
    if (queryLower.includes('program') || queryLower.includes('course') || queryLower.includes('bachelor') || queryLower.includes('master') || queryLower.includes('study')) {
      results.push({
        id: 'basic_programs',
        title: 'RMIT Programs and Courses',
        content: 'Explore RMIT\'s comprehensive range of undergraduate and postgraduate programs across all disciplines.',
        url: 'https://www.rmit.edu.au/study-with-us',
        source: 'rmit_official',
        relevanceScore: 0.9,
        searchQuery: query,
        timestamp: new Date()
      });
      
      results.push({
        id: 'basic_course_finder',
        title: 'RMIT Course Finder',
        content: 'Search and filter through all RMIT courses to find the perfect program for your career goals.',
        url: 'https://www.rmit.edu.au/study-with-us/levels-of-study',
        source: 'rmit_official',
        relevanceScore: 0.85,
        searchQuery: query,
        timestamp: new Date()
      });
    }
    
    // Computer Science specific
    if (queryLower.includes('computer science') || queryLower.includes('cs') || queryLower.includes('computing')) {
      results.push({
        id: 'basic_cs',
        title: 'Bachelor of Computer Science (BP094)',
        content: 'RMIT\'s flagship computer science program covering software development, algorithms, and emerging technologies.',
        url: 'https://www.rmit.edu.au/study-with-us/levels-of-study/undergraduate-study/bachelor-degrees/bachelor-of-computer-science-bp094',
        source: 'rmit_official',
        relevanceScore: 0.95,
        searchQuery: query,
        timestamp: new Date()
      });
    }
    
    // Application and enrollment
    if (queryLower.includes('apply') || queryLower.includes('application') || queryLower.includes('enrol') || queryLower.includes('admission')) {
      results.push({
        id: 'basic_apply',
        title: 'How to Apply to RMIT',
        content: 'Step-by-step guide to applying for RMIT programs including deadlines, requirements, and application process.',
        url: 'https://www.rmit.edu.au/study-with-us/applying-to-rmit',
        source: 'rmit_official',
        relevanceScore: 0.9,
        searchQuery: query,
        timestamp: new Date()
      });
    }
    
    // Student support
    if (queryLower.includes('help') || queryLower.includes('support') || queryLower.includes('contact') || queryLower.includes('service')) {
      results.push({
        id: 'basic_support',
        title: 'RMIT Student Information & Support',
        content: 'Access academic support, wellbeing services, career guidance, and other student support resources.',
        url: 'https://www.rmit.edu.au/students',
        source: 'rmit_official',
        relevanceScore: 0.85,
        searchQuery: query,
        timestamp: new Date()
      });
    }
    
    // Always add general RMIT homepage if no specific matches
    if (results.length === 0) {
      results.push({
        id: 'basic_home',
        title: 'RMIT University Homepage',
        content: 'RMIT University - Australia\'s largest tertiary institution with campuses in Melbourne, regional Victoria and Vietnam.',
        url: 'https://www.rmit.edu.au',
        source: 'rmit_official',
        relevanceScore: 0.7,
        searchQuery: query,
        timestamp: new Date()
      });
    }

    console.log(`🎯 Generated ${results.length} basic RMIT links`);
    return results;
  }

  private getTargetUrlsByIntent(searchIntent: ReturnType<typeof this.analyzeSearchIntent>): string[] {
    const baseUrl = 'https://www.rmit.edu.au';
    const urls: string[] = [];

    switch (searchIntent.type) {
      case 'program':
        urls.push(
          `${baseUrl}/study-with-us`,
          `${baseUrl}/study-with-us/levels-of-study`,
          `${baseUrl}/study-with-us/fields-of-study`
        );
        if (searchIntent.programLevel === 'undergraduate') {
          urls.push(`${baseUrl}/study-with-us/levels-of-study/undergraduate-study`);
        } else if (searchIntent.programLevel === 'postgraduate') {
          urls.push(`${baseUrl}/study-with-us/levels-of-study/postgraduate-study`);
        } else if (searchIntent.programLevel === 'research') {
          urls.push(`${baseUrl}/study-with-us/levels-of-study/research-programs`);
        }
        break;
      case 'policy':
        urls.push(
          `${baseUrl}/students/my-course/assessment-results/assessment-policies`,
          `${baseUrl}/about/governance-and-management/policies`
        );
        break;
      case 'service':
        urls.push(
          `${baseUrl}/students/support-and-facilities`,
          `${baseUrl}/students/support-and-facilities/student-support`
        );
        break;
      case 'contact':
        urls.push(
          `${baseUrl}/contact`,
          `${baseUrl}/students/contact`
        );
        break;
      case 'dates':
        urls.push(
          `${baseUrl}/students/my-course/important-dates`,
          `${baseUrl}/events`
        );
        break;
      default:
        urls.push(
          `${baseUrl}/study-with-us`,
          `${baseUrl}/students`
        );
    }

    return urls;
  }

  private async scrapeRMITPage(
    url: string, 
    enhancedTerms: string[],
    searchIntent: ReturnType<typeof this.analyzeSearchIntent>
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      console.log(`📄 Scraping ${url}...`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Educational Bot/1.0; +https://rmit.edu.au)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Extract page title and main content
      const pageTitle = $('h1').first().text().trim() || $('title').text().trim();
      const pageDescription = $('meta[name="description"]').attr('content') || '';
      
      // Look for links that match our search terms
      const linkSelectors = [
        'a[href*="/study-with-us/"]',
        'a[href*="/courses/"]',
        'a[href*="/programs/"]',
        'a.program-link',
        'a.course-link',
        '.search-result a',
        '.program-listing a',
        'main a[href*=".edu.au"]'
      ];

      const processedUrls = new Set<string>();
      
      for (const selector of linkSelectors) {
        $(selector).each((_, element) => {
          const $link = $(element);
          const href = $link.attr('href');
          const linkText = $link.text().trim();
          const context = $link.parent().text().trim();
          
          if (!href || !linkText || linkText.length < 5) return;
          
          const fullUrl = href.startsWith('http') ? href : `https://www.rmit.edu.au${href}`;
          
          // Skip if already processed
          if (processedUrls.has(fullUrl)) return;
          processedUrls.add(fullUrl);
          
          // Calculate relevance
          const relevance = this.calculateRelevance(
            enhancedTerms.join(' '),
            enhancedTerms,
            linkText,
            context + ' ' + pageDescription
          );
          
          if (relevance >= this.MIN_RELEVANCE_SCORE) {
            // Extract metadata if possible
            const metadata = this.extractMetadataFromUrl(fullUrl, linkText, context);
            
            results.push({
              id: `web_${results.length}_${Date.now()}`,
              title: linkText,
              content: context.length > linkText.length ? context : `${linkText} - ${pageDescription}`.slice(0, 500),
              url: fullUrl,
              source: 'rmit_official',
              relevanceScore: relevance,
              searchQuery: enhancedTerms.join(' '),
              timestamp: new Date(),
              metadata
            });
          }
        });
      }
      
      // If this is the exact page we want, add it as a result
      if (searchIntent.isUrlRequest && pageTitle) {
        const pageRelevance = this.calculateRelevance(
          enhancedTerms.join(' '),
          enhancedTerms,
          pageTitle,
          pageDescription
        );
        
        if (pageRelevance >= this.MIN_RELEVANCE_SCORE) {
          results.unshift({
            id: `page_${Date.now()}`,
            title: pageTitle,
            content: pageDescription || `Official RMIT page: ${pageTitle}`,
            url: url,
            source: 'rmit_official',
            relevanceScore: Math.min(pageRelevance + 0.2, 1.0), // Boost for being the actual page
            searchQuery: enhancedTerms.join(' '),
            timestamp: new Date()
          });
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to scrape ${url}:`, error);
    }

    return results;
  }

  private async searchRMITSearchEngine(
    query: string,
    enhancedTerms: string[],
    searchIntent: ReturnType<typeof this.analyzeSearchIntent>
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      // Try different search endpoints based on intent
      const searchUrls = this.buildSearchUrls(query, searchIntent);
      
      for (const searchUrl of searchUrls) {
        try {
          console.log(`🔍 Searching: ${searchUrl}`);
          const response = await axios.get(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Educational Bot/1.0)',
              'Accept': 'text/html,application/xhtml+xml',
            },
            timeout: 12000
          });

          if (response.status === 200) {
            const $ = cheerio.load(response.data);
            
            // Multiple possible selectors for search results
            const resultSelectors = [
              '.search-result',
              '.program-search-result',
              'article.search-item',
              '.result-item',
              'li.search-result-item'
            ];
            
            for (const selector of resultSelectors) {
              $(selector).each((_, element) => {
                const $result = $(element);
                const $link = $result.find('a').first();
                const href = $link.attr('href') || $result.find('a[href]').first().attr('href');
                const title = $link.text().trim() || $result.find('h2, h3, h4').first().text().trim();
                const description = $result.find('.description, .summary, p').first().text().trim();
                
                if (href && title) {
                  const fullUrl = href.startsWith('http') ? href : `https://www.rmit.edu.au${href}`;
                  const metadata = this.extractMetadataFromUrl(fullUrl, title, description);
                  
                  const relevance = this.calculateRelevance(
                    query,
                    enhancedTerms,
                    title,
                    description
                  );
                  
                  if (relevance >= this.MIN_RELEVANCE_SCORE) {
                    results.push({
                      id: `search_${results.length}_${Date.now()}`,
                      title: title,
                      content: description || `${title} - RMIT Program`,
                      url: fullUrl,
                      source: 'rmit_official',
                      relevanceScore: relevance,
                      searchQuery: query,
                      timestamp: new Date(),
                      metadata
                    });
                  }
                }
              });
            }
          }
          
          await this.delay(500);
          if (results.length >= 10) break;
          
        } catch (error) {
          console.error(`Search failed for ${searchUrl}:`, error);
        }
      }
      
    } catch (error) {
      console.error('❌ RMIT search engine failed:', error);
    }

    return results;
  }

  private async searchCourseFinder(
    enhancedTerms: string[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _searchIntent: ReturnType<typeof this.analyzeSearchIntent>
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      // RMIT course finder URLs
      const courseFinderUrl = 'https://www.rmit.edu.au/study-with-us/course-finder';
      
      const response = await axios.get(courseFinderUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Educational Bot/1.0)',
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Extract course links
      $('.course-card, .program-card').each((_, element) => {
        const $card = $(element);
        const href = $card.find('a').attr('href');
        const title = $card.find('.course-title, h3, h4').text().trim();
        const description = $card.find('.course-description, .summary').text().trim();
        
        if (href && title) {
          const fullUrl = href.startsWith('http') ? href : `https://www.rmit.edu.au${href}`;
          const relevance = this.calculateRelevance(
            enhancedTerms.join(' '),
            enhancedTerms,
            title,
            description
          );
          
          if (relevance >= this.MIN_RELEVANCE_SCORE) {
            results.push({
              id: `course_${results.length}_${Date.now()}`,
              title: title,
              content: description || `${title} - Available at RMIT`,
              url: fullUrl,
              source: 'rmit_official',
              relevanceScore: relevance,
              searchQuery: enhancedTerms.join(' '),
              timestamp: new Date()
            });
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Course finder search failed:', error);
    }

    return results;
  }

  private buildSearchUrls(query: string, searchIntent: ReturnType<typeof this.analyzeSearchIntent>): string[] {
    const encodedQuery = encodeURIComponent(query);
    const urls: string[] = [];
    
    // General RMIT search
    urls.push(`https://www.rmit.edu.au/search?q=${encodedQuery}`);
    
    // Program-specific search
    if (searchIntent.type === 'program') {
      if (searchIntent.programLevel === 'undergraduate') {
        urls.push(`https://www.rmit.edu.au/search?q=${encodedQuery}&s_studytype=Undergraduate+degree`);
      } else if (searchIntent.programLevel === 'postgraduate') {
        urls.push(`https://www.rmit.edu.au/search?q=${encodedQuery}&s_studytype=Postgraduate+degree`);
      }
      urls.push(`https://www.rmit.edu.au/search?q=${encodedQuery}&searchtype=program`);
    }
    
    return urls;
  }

  private extractMetadataFromUrl(
    url: string, 
    title: string, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _content: string
  ): SearchResult['metadata'] {
    const metadata: SearchResult['metadata'] = {};
    
    // Extract course code from URL or title
    const courseCodeMatch = (url + title).match(/([A-Z]{2,4}\d{3,5})/);
    if (courseCodeMatch) {
      metadata.courseCode = courseCodeMatch[1];
    }
    
    // Extract program type
    const titleLower = title.toLowerCase();
    for (const [type, patterns] of Object.entries(this.programTypePatterns)) {
      if (patterns.some(pattern => titleLower.includes(pattern))) {
        metadata.programType = type;
        break;
      }
    }
    
    // Extract faculty from URL patterns
    const facultyPatterns = {
      'business': ['business', 'management', 'economics'],
      'design': ['design', 'architecture', 'art'],
      'science': ['science', 'engineering', 'health'],
      'stem': ['computing', 'information', 'technology', 'mathematics']
    };
    
    for (const [faculty, patterns] of Object.entries(facultyPatterns)) {
      if (patterns.some(pattern => url.includes(pattern) || titleLower.includes(pattern))) {
        metadata.faculty = faculty;
        break;
      }
    }
    
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private async searchKnowledgeBase(query: string, enhancedTerms: string[]): Promise<SearchResult[]> {
    const { KnowledgeBaseService } = await import('./knowledgeBase.service');
    const knowledgeBaseService = new KnowledgeBaseService();
    
    return await knowledgeBaseService.searchForResults(query, enhancedTerms);
  }

  private extractEnhancedSearchTerms(
    query: string, 
    searchIntent: ReturnType<typeof this.analyzeSearchIntent>
  ): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
      'is', 'are', 'was', 'were', 'what', 'how', 'when', 'where', 'why', 'can', 'you', 'i', 'me',
      'tell', 'about', 'find', 'show', 'get', 'give', 'please', 'help', 'need', 'want'
    ]);
    
    // Extract meaningful words
    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word));
    
    const enhancedTerms = new Set<string>();
    
    // Add original meaningful words
    words.forEach(word => {
      enhancedTerms.add(word);
      
      // Expand abbreviations
      if (this.abbreviationMap[word]) {
        this.abbreviationMap[word].forEach(expansion => {
          enhancedTerms.add(expansion);
          // Add individual words from multi-word expansions
          expansion.split(' ').forEach(w => {
            if (w.length > 2 && !stopWords.has(w)) {
              enhancedTerms.add(w);
            }
          });
        });
      }
    });
    
    // Always include RMIT in searches
    enhancedTerms.add('rmit');
    
    // Add intent-based terms
    if (searchIntent.type === 'program' && searchIntent.programLevel) {
      const patterns = this.programTypePatterns[searchIntent.programLevel as keyof typeof this.programTypePatterns];
      if (patterns) {
        patterns.forEach((term: string) => {
          enhancedTerms.add(term);
        });
      }
    }
    
    // Extract and preserve course codes
    const courseCodeRegex = /\b([A-Z]{2,4}\d{3,5})\b/gi;
    const courseCodes = query.match(courseCodeRegex) || [];
    courseCodes.forEach(code => enhancedTerms.add(code.toUpperCase()));
    
    // Extract years (for dates/deadlines)
    const yearRegex = /\b(20\d{2})\b/g;
    const years = query.match(yearRegex) || [];
    years.forEach(year => enhancedTerms.add(year));
    
    return Array.from(enhancedTerms).slice(0, 20); // Limit to prevent over-broad searches
  }

  private calculateRelevance(
    query: string,
    searchTerms: string[],
    title: string,
    content: string
  ): number {
    let score = 0;
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact query match in title (highest weight)
    if (titleLower === queryLower) {
      score += 0.9;
    } else if (titleLower.includes(queryLower)) {
      score += 0.6;
    }

    // Important terms matching
    const importantTerms = searchTerms.filter(term => 
      !['rmit', 'university', 'melbourne'].includes(term.toLowerCase())
    );
    
    importantTerms.forEach(term => {
      const termLower = term.toLowerCase();
      
      // Title matches (high weight)
      if (titleLower.includes(termLower)) {
        score += 0.4 / importantTerms.length;
      }
      
      // Content matches (lower weight)
      if (contentLower.includes(termLower)) {
        score += 0.2 / importantTerms.length;
      }
    });
    
    // URL pattern bonuses
    if (title.toLowerCase().includes('official') || content.includes('rmit.edu.au')) {
      score += 0.1;
    }
    
    // Program-specific bonuses
    const programKeywords = ['bachelor', 'master', 'diploma', 'certificate', 'degree', 'program', 'course'];
    const matchedKeywords = programKeywords.filter(keyword => titleLower.includes(keyword));
    if (matchedKeywords.length > 0) {
      score += 0.1 * Math.min(matchedKeywords.length, 2);
    }
    
    // Penalty for overly generic results
    if (titleLower === 'rmit university' || titleLower === 'home') {
      score *= 0.5;
    }
    
    return Math.min(score, 1.0);
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Map<string, SearchResult>();
    
    results.forEach(result => {
      // Normalize URL for comparison
      const normalizedUrl = result.url
        .toLowerCase()
        .replace(/\/$/, '') // Remove trailing slash
        .replace(/^https?:\/\//, ''); // Remove protocol
      
      const existing = seen.get(normalizedUrl);
      
      if (!existing || result.relevanceScore > existing.relevanceScore) {
        seen.set(normalizedUrl, result);
      }
    });
    
    return Array.from(seen.values());
  }

  private enrichResults(
    results: SearchResult[],
    _query: string,
    searchTerms: string[]
  ): SearchResult[] {
    return results.map(result => {
      // Enrich content if it's too short
      if (result.content.length < 50 && result.title.length > result.content.length) {
        result.content = `${result.title} - Access this RMIT resource for more information about ${searchTerms.slice(0, 3).join(', ')}.`;
      }
      
      // Clean up content
      result.content = result.content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
      
      // Ensure URLs are complete
      if (!result.url.startsWith('http')) {
        result.url = `https://www.rmit.edu.au${result.url}`;
      }
      
      return result;
    });
  }

  private rankResults(
    results: SearchResult[],
    _query: string,
    searchIntent: ReturnType<typeof this.analyzeSearchIntent>
  ): SearchResult[] {
    return results.sort((a, b) => {
      // Primary sort by relevance score
      let scoreA = a.relevanceScore;
      let scoreB = b.relevanceScore;
      
      // Boost official RMIT sources
      if (a.source === 'rmit_official') scoreA += 0.1;
      if (b.source === 'rmit_official') scoreB += 0.1;
      
      // Boost results that match the search intent
      if (searchIntent.isUrlRequest) {
        // For URL requests, prioritize actual program/service pages
        if (a.url.includes('/bachelor-') || a.url.includes('/master-')) scoreA += 0.2;
        if (b.url.includes('/bachelor-') || b.url.includes('/master-')) scoreB += 0.2;
      }
      
      // Boost results with metadata
      if (a.metadata?.courseCode) scoreA += 0.05;
      if (b.metadata?.courseCode) scoreB += 0.05;
      
      // Ensure scores don't exceed 1.0
      scoreA = Math.min(scoreA, 1.0);
      scoreB = Math.min(scoreB, 1.0);
      
      return scoreB - scoreA;
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getCachedResult(cacheKey: string): SearchResult[] | null {
    const cached = this.searchCache.get(cacheKey);
    if (!cached || Date.now() > cached.expiresAt) {
      this.searchCache.delete(cacheKey);
      return null;
    }
    return cached.results;
  }

  private setCachedResult(cacheKey: string, results: SearchResult[]): void {
    const now = Date.now();
    this.searchCache.set(cacheKey, {
      results,
      timestamp: now,
      expiresAt: now + this.CACHE_DURATION
    });
    
    // Clean up old cache entries
    if (this.searchCache.size > 100) {
      const entries = Array.from(this.searchCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20 entries
      entries.slice(0, 20).forEach(([key]) => this.searchCache.delete(key));
    }
  }

  private createTimeoutPromise(): Promise<SearchResult[]> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Search timeout')), this.SEARCH_TIMEOUT);
    });
  }

  /**
   * Enhanced search decision logic with intent recognition
   */
  static shouldPerformSearch(query: string, conversationContext?: string[]): boolean {
    const queryLower = query.toLowerCase();
    
    // Check for memory/context questions first
    if (conversationContext && conversationContext.length > 0) {
      const memoryQuestions = [
        'what was my', 'what did i', 'my first', 'my last', 'my previous',
        'earlier', 'before', 'already asked', 'already mentioned'
      ];
      
      if (memoryQuestions.some(pattern => queryLower.includes(pattern))) {
        console.log('🧠 Context-based question - using conversation history');
        return false;
      }
    }
    
    // Explicit search triggers (always search)
    const explicitSearchTriggers = [
      'find', 'search', 'look up', 'look for',
      'show me', 'where can i', 'where do i', 'where is',
      'link', 'url', 'website', 'page',
      'how do i apply', 'how to apply', 'application',
      'deadline', 'due date', 'closing date',
      'contact', 'phone', 'email'
    ];

    if (explicitSearchTriggers.some(trigger => queryLower.includes(trigger))) {
      console.log('🔍 Explicit search request detected');
      return true;
    }

    // Program/course queries (always search for current info)
    const programPatterns = [
      /bachelor\s+of/i,
      /master\s+of/i,
      /diploma\s+of/i,
      /certificate\s+in/i,
      /\b[a-z]{2,4}\d{3,5}\b/i, // Course codes
      /program|course|degree|study/i
    ];

    if (programPatterns.some(pattern => pattern.test(query))) {
      console.log('🔍 Program/course query detected');
      return true;
    }

    // Current information queries (dates, fees, requirements)
    const currentInfoPatterns = [
      'requirement', 'prerequisite', 'atar', 'gpa',
      'fee', 'cost', 'price', 'tuition',
      'date', 'when', 'current', 'latest', '2024', '2025',
      'campus', 'location', 'where'
    ];

    if (currentInfoPatterns.some(pattern => queryLower.includes(pattern))) {
      console.log('🔍 Current information query detected');
      return true;
    }

    // General questions that don't need search
    const noSearchPatterns = [
      'hello', 'hi', 'hey', 'thanks', 'thank you',
      'how are you', 'who are you', 'what can you do',
      'help', 'assist', 'guidance'
    ];

    if (noSearchPatterns.some(pattern => queryLower.includes(pattern)) && queryLower.length < 20) {
      console.log('🧠 General greeting/help - no search needed');
      return false;
    }

    // For ambiguous cases, look for RMIT-specific terms
    const rmitSpecificTerms = ['rmit', 'enrollment', 'semester', 'trimester', 'myrmit'];
    if (rmitSpecificTerms.some(term => queryLower.includes(term))) {
      console.log('🔍 RMIT-specific query - searching for current info');
      return true;
    }

    console.log('🧠 General query - will use knowledge base');
    return false;
  }
}
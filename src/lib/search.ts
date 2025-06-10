import { db } from '@/server/db/db';
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

export class RealTimeSearchEngine {
  private readonly MAX_RESULTS = 10;
  private readonly SEARCH_TIMEOUT = 15000; // 15 seconds for comprehensive search
  private readonly MIN_RELEVANCE_SCORE = 0.15;
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  
  private searchCache = new Map<string, CachedSearchResult>();

  // Enhanced abbreviation mapping based on agent.py patterns
  private readonly abbreviationMap: Record<string, string[]> = {
    'bach': ['bachelor', 'undergraduate'], // Only expand when "bach" is standalone word
    'bac': ['bachelor', 'undergraduate'],
    'master': ['masters', 'postgraduate', 'graduate'],
    'masters': ['master', 'postgraduate', 'graduate'],
    'cs': ['computer science', 'computing', 'software'],
    'it': ['information technology', 'computing', 'tech'],
    'se': ['software engineering', 'software development'],
    'ai': ['artificial intelligence', 'machine learning'],
    'ml': ['machine learning', 'artificial intelligence'],
    'eng': ['engineering'],
    'bus': ['business'],
    'edu': ['education', 'teaching'],
    'sci': ['science', 'sciences'],
    'tech': ['technology', 'technical'],
    'uni': ['university'],
    'rmit': ['rmit university', 'royal melbourne institute of technology']
  };

  /**
   * Main search method - uses RMIT sitemap approach like agent.py
   */
  async performSearch(
    query: string,
    includeWeb: boolean = true,
    includeKnowledgeBase: boolean = true
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    
    console.log('🔍 Starting enhanced RMIT search for:', query);
    
    // Extract and enhance search terms
    const enhancedTerms = this.extractEnhancedSearchTerms(query);
    console.log('📝 Enhanced search terms:', enhancedTerms);

    const searchPromises: Promise<SearchResult[]>[] = [];

    // Search knowledge base if requested
    if (includeKnowledgeBase) {
      console.log('📚 Searching knowledge base...');
      searchPromises.push(this.searchKnowledgeBase(query, enhancedTerms));
    }

    // Real-time web scraping using working RMIT URLs
    if (includeWeb) {
      console.log('🌐 Starting RMIT website search with working URLs...');
      searchPromises.push(this.performRMITWebSearch(query, enhancedTerms));
    }

    try {
      const searchResults = await Promise.allSettled(
        searchPromises.map(promise => 
          Promise.race([
            promise,
            this.createTimeoutPromise()
          ])
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

      // Remove duplicates and sort by relevance
      const uniqueResults = this.removeDuplicateResults(allResults);
      // Filter by relevance but protect Computer Science results
      const filteredResults = uniqueResults.filter(result => {
        // Always include Computer Science results regardless of score
        if (result.title.toLowerCase().includes('computer science') || 
            result.url.includes('computer-science') ||
            result.url.includes('bp094')) {
          return true;
        }
        // Normal filtering for other results
        return result.relevanceScore >= this.MIN_RELEVANCE_SCORE;
      });
      // Ensure Computer Science results are prioritized when searching for CS
      let sortedResults = filteredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      // Special handling for Computer Science queries
      if (query.toLowerCase().includes('cs') || query.toLowerCase().includes('computer science')) {
        const csResults = sortedResults.filter(r => 
          r.title.toLowerCase().includes('computer science') || 
          r.url.includes('computer-science') ||
          r.url.includes('bp094')
        );
        
        if (csResults.length > 0) {
          const nonCSResults = sortedResults.filter(r => 
            !r.title.toLowerCase().includes('computer science') && 
            !r.url.includes('computer-science') &&
            !r.url.includes('bp094')
          );
          
          // Put ALL Computer Science results first
          sortedResults = [
            ...csResults,
            ...nonCSResults.slice(0, this.MAX_RESULTS - csResults.length)
          ];
          
          console.log(`🎯 FORCED Computer Science results to top positions (${csResults.length} CS results)`);
        }
      }
      // Prioritize program-specific results when user asks for specific programs
      else if (query.toLowerCase().includes('bach') || query.toLowerCase().includes('bachelor') || 
          query.toLowerCase().includes('master') || query.toLowerCase().includes('diploma') ||
          /\b[a-z]{2,4}\d{3,5}\b/i.test(query)) { // Also for course codes like BP094
        
        // Find program-specific results
        const programResults = sortedResults.filter(r => {
          const titleLower = r.title.toLowerCase();
          const urlLower = r.url.toLowerCase();
          
          return (
            titleLower.includes('bachelor') || titleLower.includes('master') || 
            titleLower.includes('diploma') || titleLower.includes('certificate') ||
            urlLower.includes('/bachelor-') || urlLower.includes('/master-') ||
            urlLower.includes('/diploma-') || urlLower.includes('/certificate-') ||
            /bp\d{3}|mr\d{3}|dr\d{3}/i.test(r.url) // Course codes
          );
        });
        
        if (programResults.length > 0) {
          // Remove program results from main list
          const nonProgramResults = sortedResults.filter(r => {
            const titleLower = r.title.toLowerCase();
            const urlLower = r.url.toLowerCase();
            
            return !(
              titleLower.includes('bachelor') || titleLower.includes('master') || 
              titleLower.includes('diploma') || titleLower.includes('certificate') ||
              urlLower.includes('/bachelor-') || urlLower.includes('/master-') ||
              urlLower.includes('/diploma-') || urlLower.includes('/certificate-') ||
              /bp\d{3}|mr\d{3}|dr\d{3}/i.test(r.url)
            );
          });
          
          // Put best program results first, then fill with other results
          const programCount = Math.min(5, programResults.length); // Up to 5 program results
          sortedResults = [
            ...programResults.slice(0, programCount),
            ...nonProgramResults.slice(0, this.MAX_RESULTS - programCount)
          ];
          
          console.log(`📚 Prioritized ${programCount} program-specific results for query containing program keywords`);
        }
      }
      
      // Ensure we don't exceed max results
      sortedResults = sortedResults.slice(0, this.MAX_RESULTS);

      // Debug logging for Computer Science queries
      if (query.toLowerCase().includes('cs') || query.toLowerCase().includes('computer science') || query.toLowerCase().includes('bach')) {
        console.log(`🔍 Debug: Original results: ${allResults.length}, Unique: ${uniqueResults.length}, Filtered: ${filteredResults.length}, Final: ${sortedResults.length}`);
        
        // Show Computer Science results specifically
        const allCSResults = allResults.filter(r => 
          r.title.toLowerCase().includes('computer science') || 
          r.url.includes('computer-science') ||
          r.url.includes('bp094')
        );
        const uniqueCSResults = uniqueResults.filter(r => 
          r.title.toLowerCase().includes('computer science') || 
          r.url.includes('computer-science') ||
          r.url.includes('bp094')
        );
        const filteredCSResults = filteredResults.filter(r => 
          r.title.toLowerCase().includes('computer science') || 
          r.url.includes('computer-science') ||
          r.url.includes('bp094')
        );
        
        console.log(`💻 CS Results - All: ${allCSResults.length}, Unique: ${uniqueCSResults.length}, Filtered: ${filteredCSResults.length}`);
        
        if (allCSResults.length > 0) {
          console.log('🔍 All CS results found:');
          allCSResults.forEach((result, index) => {
            console.log(`  ALL-CS${index + 1}. ${result.title} (Score: ${result.relevanceScore.toFixed(3)}) - ${result.url}`);
          });
        }
        
        if (filteredCSResults.length > 0) {
          console.log('✅ Filtered CS results:');
          filteredCSResults.forEach((result, index) => {
            console.log(`  FILT-CS${index + 1}. ${result.title} (Score: ${result.relevanceScore.toFixed(3)}) - ${result.url}`);
          });
        } else {
          console.log('❌ No CS results made it through filtering! This is the problem.');
        }
        
        console.log('🎯 Top 5 final results:');
        sortedResults.slice(0, 5).forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.title} (Score: ${result.relevanceScore.toFixed(3)}) - ${result.url}`);
        });
      }

      // Calculate source distribution
      const sources = {
        web: sortedResults.filter(r => r.source === 'web').length,
        knowledge_base: sortedResults.filter(r => r.source === 'knowledge_base').length,
        rmit_official: sortedResults.filter(r => r.source === 'rmit_official').length,
      };

      const searchTime = Date.now() - startTime;
      console.log(`🎯 Search completed: ${sortedResults.length} results in ${searchTime}ms`);

      return {
        results: sortedResults,
        query,
        totalResults: filteredResults.length, // Show total available results, not just returned results
        searchTime,
        sources
      };

    } catch (error) {
      console.error('❌ Search error:', error);
      
      // Emergency fallback to knowledge base only
      try {
        const fallbackResults = await this.searchKnowledgeBase(query, this.extractEnhancedSearchTerms(query));
        return {
          results: fallbackResults.slice(0, 5),
          query,
          totalResults: fallbackResults.length,
          searchTime: Date.now() - startTime,
          sources: { web: 0, knowledge_base: fallbackResults.length, rmit_official: 0 }
        };
      } catch {
        return {
          results: [],
          query,
          totalResults: 0,
          searchTime: Date.now() - startTime,
          sources: { web: 0, knowledge_base: 0, rmit_official: 0 }
        };
      }
    }
  }

  /**
   * RMIT web search using working URLs from sitemap analysis
   */
  private async performRMITWebSearch(query: string, enhancedTerms: string[]): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];
    
    // Check cache first
    const cacheKey = `rmit_web_${query.toLowerCase()}`;
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      console.log('💾 Using cached RMIT web results');
      return cached;
    }

    // Strategy 1: Search main study pages
    try {
      console.log('🔍 Searching main RMIT study pages...');
      const studyResults = await this.searchRMITStudyPages(enhancedTerms);
      allResults.push(...studyResults);
    } catch (error) {
      console.error('❌ Study pages search failed:', error);
    }

    // Strategy 2: Search RMIT's program search API
    try {
      console.log('🔍 Searching RMIT program search API...');
      const programSearchResults = await this.searchRMITProgramSearch(enhancedTerms);
      allResults.push(...programSearchResults);
    } catch (error) {
      console.error('❌ Program search failed:', error);
    }

    // Strategy 3: Search RMIT sitemap for specific programs
    try {
      console.log('📄 Searching RMIT sitemap for program pages...');
      const sitemapResults = await this.searchRMITSitemap(enhancedTerms);
      allResults.push(...sitemapResults);
    } catch (error) {
      console.error('❌ Sitemap search failed:', error);
    }

    // Strategy 4: Direct program page search for Computer Science
    if (enhancedTerms.some(term => ['computer', 'science', 'cs', 'bachelor'].includes(term.toLowerCase()))) {
      try {
        console.log('💻 Searching for Computer Science specific pages...');
        const csResults = await this.searchComputerSciencePages();
        if (csResults.length > 0) {
          allResults.push(...csResults);
          console.log(`✅ CS-specific search found ${csResults.length} results`);
        }
      } catch (error) {
        console.error('❌ CS-specific search failed (non-critical):', error);
        // Don't fail the entire search - continue with other results
      }
    }

    // Cache successful results
    if (allResults.length > 0) {
      this.setCachedResult(cacheKey, allResults);
    }

    console.log(`✅ RMIT web search found ${allResults.length} total results`);
    return this.removeDuplicateResults(allResults).slice(0, 15);
  }

  /**
   * Search main RMIT study pages (verified working URLs)
   */
  private async searchRMITStudyPages(enhancedTerms: string[]): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    // Working RMIT URLs (verified 200 status)
    const studyPageUrls = [
      'https://www.rmit.edu.au/study-with-us',
      'https://www.rmit.edu.au/study-with-us/levels-of-study',
      'https://www.rmit.edu.au/study-with-us/levels-of-study/undergraduate-study',
      'https://www.rmit.edu.au/study-with-us/levels-of-study/postgraduate-study',
      'https://www.rmit.edu.au/study-with-us/levels-of-study/vocational-study'
    ];

    for (const baseUrl of studyPageUrls) {
      try {
        console.log(`📄 Scraping ${baseUrl}...`);
        
        const response = await axios.get(baseUrl, {
          headers: {
            'User-Agent': 'Educational Knowledge Base Crawler for Course Information',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
          },
          timeout: 10000
        });

        const $ = cheerio.load(response.data);
        
        // Look for program links with various selectors (from agent.py approach)
        const programSelectors = [
          'a[href*="/bachelor-"], a[href*="/master-"], a[href*="/diploma-"]',
          'a[href*="/courses/"]',
          'a[href*="/study-with-us/"]',
          '.program-link a, .course-link a',
          '[data-component="program-card"] a',
          '.program-listing a',
          'article a[href*="/study-with-us/"]'
        ];

        for (const selector of programSelectors) {
          $(selector).each((_, element) => {
            const $link = $(element);
            const href = $link.attr('href');
            const text = $link.text().trim();
            
            // Also check parent elements for text
            const parentText = $link.parent().text().trim();
            const title = text.length > 10 ? text : parentText;
            
            if (href && title && title.length > 10) {
              // Check if this matches our search terms
              const titleLower = title.toLowerCase();
              const matchCount = enhancedTerms.filter(term => 
                titleLower.includes(term.toLowerCase())
              ).length;
              
              if (matchCount > 0) {
                const fullUrl = href.startsWith('http') ? href : `https://www.rmit.edu.au${href}`;
                
                // Verify it's a program URL
                if (fullUrl.includes('/bachelor-') || fullUrl.includes('/master-') || 
                    fullUrl.includes('/diploma-') || fullUrl.includes('/certificate-') ||
                    fullUrl.includes('/study-with-us/') || fullUrl.includes('/courses/')) {
                  
                  results.push({
                    id: `study_${results.length}`,
                    title,
                    content: `RMIT Program: ${title}`,
                    url: fullUrl,
                    source: 'rmit_official',
                    relevanceScore: this.calculateRelevance(enhancedTerms.join(' '), enhancedTerms, title, title),
                    searchQuery: enhancedTerms.join(' '),
                    timestamp: new Date()
                  });
                }
              }
            }
          });
        }
        
        // Add a small delay to be respectful
        await this.delay(300);
        
      } catch (error) {
        console.error(`❌ Failed to scrape ${baseUrl}:`, error);
        continue;
      }
      
      // Limit to avoid overwhelming results
      if (results.length >= 10) break;
    }

    return results;
  }

  /**
   * Search RMIT's program search API (enhanced to find exact URLs)
   */
  private async searchRMITProgramSearch(enhancedTerms: string[]): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      // Enhanced search queries for better Computer Science matching
      const searchQueries = [
        'computer science',
        'bachelor computer science',
        'information technology',
        'software engineering',
        'computer',
        'bachelor computer'
      ];
      
      for (const searchQuery of searchQueries) {
        // Check if this search query is relevant to our enhanced terms
        const queryWords = searchQuery.toLowerCase().split(' ');
        const isRelevant = queryWords.some(word => 
          enhancedTerms.some(term => term.toLowerCase().includes(word) || word.includes(term.toLowerCase()))
        );
        
        if (!isRelevant) continue;
        
        const searchUrl = `https://www.rmit.edu.au/search?q=${encodeURIComponent(searchQuery)}&s_studytype=Undergraduate+degree&searchtype=program&current=1&size=20`;
        
        console.log(`🔍 Searching RMIT programs for: ${searchQuery}`);
        
        const response = await axios.get(searchUrl, {
          headers: {
            'User-Agent': 'Educational Knowledge Base Crawler for Course Information',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          timeout: 12000
        });

        if (response.status === 200) {
          const $ = cheerio.load(response.data);
          
          // Look for program result links with multiple selectors
          const programSelectors = [
            '.pageResult--Title a',
            '.pageResult--Title',
            '.search-result-title a',
            '.program-result a',
            'a[href*="/bachelor-"]',
            'a[href*="computer-science"]'
          ];
          
          for (const selector of programSelectors) {
            $(selector).each((_, element) => {
              const $element = $(element);
              let href = $element.attr('href');
              let title = $element.text().trim();
              
              // If element doesn't have href, check if it's a parent of a link
              if (!href) {
                const $link = $element.find('a').first();
                if ($link.length > 0) {
                  href = $link.attr('href');
                  title = title || $link.text().trim();
                }
              }
              
              // Also check parent elements for links
              if (!href) {
                const $parentLink = $element.closest('a');
                if ($parentLink.length > 0) {
                  href = $parentLink.attr('href');
                }
              }
              
              if (href && title && title.length > 10) {
                const fullUrl = href.startsWith('http') ? href : `https://www.rmit.edu.au${href}`;
                
                // Calculate base relevance score
                let relevanceScore = this.calculateRelevance(enhancedTerms.join(' '), enhancedTerms, title, title);
                
                // Special handling for Computer Science programs
                if (title.toLowerCase().includes('computer science')) {
                  if (fullUrl.includes('bp094')) {
                    relevanceScore = 0.95; // Highest for BP094
                    console.log(`🎯 Found exact Computer Science program: ${fullUrl}`);
                  } else if (title.toLowerCase().includes('bachelor')) {
                    relevanceScore = Math.max(relevanceScore, 0.85); // High for bachelor CS
                  } else {
                    relevanceScore = Math.max(relevanceScore, 0.75); // Good for other CS programs
                  }
                } else if (title.toLowerCase().includes('data science') || 
                           title.toLowerCase().includes('software engineering') ||
                           title.toLowerCase().includes('cyber security')) {
                  // Related programs get good scores too
                  relevanceScore = Math.max(relevanceScore, 0.70);
                }
                
                // Final cap to ensure no score exceeds 1.0
                relevanceScore = Math.min(relevanceScore, 1.0);
                
                results.push({
                  id: `program_search_${results.length}`,
                  title: title,
                  content: `${title} - RMIT University program page. Direct URL: ${fullUrl}`,
                  url: fullUrl,
                  source: 'rmit_official',
                  relevanceScore,
                  searchQuery: searchQuery,
                  timestamp: new Date()
                });
              }
            });
          }
          
          console.log(`✅ Found ${$('.pageResult--Title, .search-result-title').length} programs for "${searchQuery}"`);
        }
        
        // Small delay between requests
        await this.delay(500);
        
        // Continue searching even if we have results to ensure we find the best match
        if (results.length >= 15) break;
      }
      
      // Try direct search for Computer Science program if not found yet
      if (enhancedTerms.some(term => ['computer', 'science', 'cs'].includes(term.toLowerCase()))) {
        try {
          console.log('🎯 Attempting direct Computer Science program search...');
          await this.searchDirectComputerScienceProgram(results);
        } catch (error) {
          console.log('⚠️ Direct CS search failed (non-critical):', error instanceof Error ? error.message : 'Unknown error');
        }
      }
      
    } catch (error) {
      console.error('❌ RMIT program search failed:', error);
    }

    // Sort by relevance and return best results
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);
  }

  /**
   * Direct search for Computer Science program using known patterns
   */
  private async searchDirectComputerScienceProgram(existingResults: SearchResult[]): Promise<void> {
    try {
      // Known Computer Science program patterns at RMIT
      const csUrls = [
        'https://www.rmit.edu.au/study-with-us/levels-of-study/undergraduate-study/bachelor-degrees/bachelor-of-computer-science-bp094',
        'https://www.rmit.edu.au/study-with-us/levels-of-study/undergraduate-study',
        'https://www.rmit.edu.au/search?q=bachelor+computer+science+bp094'
      ];
      
      for (const testUrl of csUrls) {
        try {
          const response = await axios.get(testUrl, {
            headers: { 'User-Agent': 'Educational Knowledge Base Crawler for Course Information' },
            timeout: 8000
          });
          
          if (response.status === 200) {
            const $ = cheerio.load(response.data);
            
            // Look for Computer Science program links
            $('a').each((_, element) => {
              const $link = $(element);
              const href = $link.attr('href') || '';
              const text = $link.text().trim();
              
              if ((href.includes('computer-science') || href.includes('bp094')) && 
                  (text.toLowerCase().includes('computer science') || text.toLowerCase().includes('bachelor'))) {
                
                const fullUrl = href.startsWith('http') ? href : `https://www.rmit.edu.au${href}`;
                
                // Check if we already have this URL
                const alreadyExists = existingResults.some(result => result.url === fullUrl);
                if (!alreadyExists) {
                  existingResults.push({
                    id: `direct_cs_${existingResults.length}`,
                    title: text || 'Bachelor of Computer Science',
                    content: 'RMIT Bachelor of Computer Science program',
                    url: fullUrl,
                    source: 'rmit_official',
                    relevanceScore: 0.9,
                    searchQuery: 'computer science direct',
                    timestamp: new Date()
                  });
                  
                  console.log(`✅ Found direct CS program: ${fullUrl}`);
                }
              }
            });
          }
        } catch (error) {
          console.log(`⚠️ Direct test for ${testUrl} failed:`, error instanceof Error ? error.message : 'Unknown error');
          continue;
        }
      }
    } catch (error) {
      console.log('⚠️ Direct CS program search failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Search RMIT sitemap for specific program URLs
   */
  private async searchRMITSitemap(enhancedTerms: string[]): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      console.log('📄 Fetching RMIT sitemap...');
      const response = await axios.get('https://www.rmit.edu.au/sitemap.xml', {
        headers: {
          'User-Agent': 'Educational Knowledge Base Crawler for Course Information',
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      
      // Extract URLs that might contain our search terms
      $('loc').each((_, element) => {
        const url = $(element).text().trim();
        
        if (url && url.includes('rmit.edu.au')) {
          const urlLower = url.toLowerCase();
          
          // Check if URL matches our search terms
          const matchCount = enhancedTerms.filter(term => 
            urlLower.includes(term.toLowerCase())
          ).length;
          
          if (matchCount > 0) {
            // Prioritize course-related URLs
            if (urlLower.includes('/bachelor-') || urlLower.includes('/master-') || 
                urlLower.includes('/diploma-') || urlLower.includes('/courses/') ||
                urlLower.includes('computer') || urlLower.includes('science')) {
              
              // Extract title from URL
              const urlParts = url.split('/');
              const lastPart = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
              const title = lastPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              
              results.push({
                id: `sitemap_${results.length}`,
                title: title || 'RMIT Program',
                content: `RMIT program page: ${title}`,
                url: url,
                source: 'rmit_official',
                relevanceScore: this.calculateRelevance(enhancedTerms.join(' '), enhancedTerms, title, title),
                searchQuery: enhancedTerms.join(' '),
                timestamp: new Date()
              });
            }
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Sitemap search failed:', error);
    }

    return results.slice(0, 10); // Limit sitemap results
  }

  /**
   * Search for Computer Science specific pages
   */
  private async searchComputerSciencePages(): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    // Known working paths for Computer Science at RMIT (verified URLs only)
    const csUrls = [
      'https://www.rmit.edu.au/study-with-us/levels-of-study/undergraduate-study',
      'https://www.rmit.edu.au/study-with-us/levels-of-study/postgraduate-study'
    ];

    for (const url of csUrls) {
      try {
        console.log(`🔍 Searching CS content at: ${url}`);
        const response = await axios.get(url, {
          headers: { 'User-Agent': 'Educational Knowledge Base Crawler for Course Information' },
          timeout: 8000
        });

        if (response.status === 200) {
          const $ = cheerio.load(response.data);
          
          // Look for any links containing "computer" and "science"
          $('a').each((_, element) => {
            const $link = $(element);
            const href = $link.attr('href') || '';
            const text = $link.text().trim().toLowerCase();
            
            if ((text.includes('computer') && text.includes('science')) ||
                (text.includes('bachelor') && text.includes('computer')) ||
                text.includes('information technology') ||
                href.toLowerCase().includes('computer')) {
              
              const fullUrl = href.startsWith('http') ? href : `https://www.rmit.edu.au${href}`;
              
              results.push({
                id: `cs_specific_${results.length}`,
                title: $link.text().trim() || 'Computer Science Program',
                content: 'RMIT Computer Science program information',
                url: fullUrl,
                source: 'rmit_official',
                relevanceScore: 0.9, // High relevance for CS-specific searches
                searchQuery: 'computer science',
                timestamp: new Date()
              });
            }
          });
          
          console.log(`✅ Successfully searched ${url}, found ${results.length} CS-related links so far`);
        }
        
      } catch (error) {
        console.log(`⚠️ Skipping ${url} due to error:`, error instanceof Error ? error.message : 'Unknown error');
        // Continue with next URL instead of failing entirely
        continue;
      }
    }

    return results.slice(0, 5);
  }

  /**
   * Enhanced knowledge base search
   */
  private async searchKnowledgeBase(query: string, enhancedTerms: string[]): Promise<SearchResult[]> {
    try {
      // Search with multiple strategies
      const kbResults = await db.knowledgeBase.findMany({
        where: {
          isActive: true,
          OR: [
            // Strategy 1: Match any enhanced term
            ...enhancedTerms.map(term => ({
              OR: [
                { title: { contains: term, mode: 'insensitive' as const } },
                { content: { contains: term, mode: 'insensitive' as const } },
                { tags: { has: term } },
                { category: { contains: term, mode: 'insensitive' as const } }
              ]
            })),
            // Strategy 2: Match original query
            { title: { contains: query, mode: 'insensitive' as const } },
            { content: { contains: query, mode: 'insensitive' as const } }
          ]
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 20
      });

      return kbResults.map((item) => ({
        id: `kb_${item.id}`,
        title: item.title,
        content: item.content.slice(0, 500),
        url: item.sourceUrl,
        source: 'knowledge_base' as const,
        relevanceScore: this.calculateRelevance(query, enhancedTerms, item.title, item.content),
        searchQuery: query,
        timestamp: new Date()
      }));

    } catch (error) {
      console.error('❌ Knowledge base search error:', error);
      return [];
    }
  }

  /**
   * Enhanced search term extraction based on agent.py patterns
   */
  private extractEnhancedSearchTerms(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
      'is', 'are', 'was', 'were', 'what', 'how', 'when', 'where', 'why', 'can', 'you', 'search',
      'tell', 'me', 'about', 'find', 'show', 'get', 'give', 'please', 'help', 'need', 'want',
      'link', 'page', 'website', 'url'
    ]);
    
    // Clean the query
    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word));
    
    const enhancedTerms = new Set<string>();
    
    // Add original terms and their expansions
    words.forEach(word => {
      enhancedTerms.add(word);
      
      // Add abbreviation expansions - but be more careful with "bach"
      if (this.abbreviationMap[word]) {
        // Special handling for "bach" - only expand if it appears to be abbreviation context
        if (word === 'bach') {
          // Check if this looks like an abbreviation (appears with other program terms)
          const hasOtherProgramTerms = words.some(w => 
            ['of', 'cs', 'computer', 'science', 'it', 'engineering', 'business'].includes(w.toLowerCase())
          );
          if (hasOtherProgramTerms) {
            this.abbreviationMap[word].forEach(expansion => {
              enhancedTerms.add(expansion);
              expansion.split(' ').forEach(w => {
                if (w.length > 2) enhancedTerms.add(w);
              });
            });
          }
        } else {
          // Normal expansion for other abbreviations
          this.abbreviationMap[word].forEach(expansion => {
            enhancedTerms.add(expansion);
            expansion.split(' ').forEach(w => {
              if (w.length > 2) enhancedTerms.add(w);
            });
          });
        }
      }
    });
    
    // Always add RMIT for better results
    enhancedTerms.add('rmit');
    
    // Extract course codes based on RMIT patterns (from agent.py)
    const courseCodeRegex = /\b([A-Z]{2,4}\d{3,5})\b/gi;
    const courseCodes = query.match(courseCodeRegex) || [];
    courseCodes.forEach(code => enhancedTerms.add(code.toUpperCase()));
    
    return Array.from(enhancedTerms).slice(0, 15);
  }

  /**
   * Calculate relevance score
   */
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

    // Exact query match in title (highest score)
    if (titleLower.includes(queryLower)) {
      score += 0.6;
    }

    // Count term matches - but be selective about generic terms
    const genericTerms = ['university', 'rmit university', 'royal melbourne institute of technology', 'royal', 'melbourne', 'rmit'];
    const importantTerms = searchTerms.filter(term => !genericTerms.includes(term.toLowerCase()));
    
    importantTerms.forEach(term => {
      const termLower = term.toLowerCase();
      if (titleLower.includes(termLower)) {
        score += 0.3;
      }
      if (contentLower.includes(termLower)) {
        score += 0.1;
      }
    });
    
    // Give small boost for RMIT context (since all results should be from RMIT)
    if (titleLower.includes('rmit') || contentLower.includes('rmit')) {
      score += 0.05;
    }

    // Boost for program-related content
    const programKeywords = ['bachelor', 'master', 'diploma', 'certificate', 'degree', 'program', 'course'];
    if (programKeywords.some(keyword => titleLower.includes(keyword))) {
      score += 0.2;
    }

    // Boost for exact program matches
    if (titleLower.includes('computer science') && (queryLower.includes('cs') || queryLower.includes('computer science'))) {
      score = Math.min(score + 0.3, 1.0); // Reduced and capped boost
    }

    // Boost for Information Technology matches
    if (titleLower.includes('information technology') && (queryLower.includes('it') || queryLower.includes('information technology'))) {
      score = Math.min(score + 0.3, 1.0); // Reduced and capped boost
    }

    // Special boost for bachelor + computer science combinations when user asks for "bach" + "cs"
    if (titleLower.includes('bachelor') && titleLower.includes('computer science') && 
        (queryLower.includes('bach') || queryLower.includes('bachelor')) && 
        (queryLower.includes('cs') || queryLower.includes('computer science'))) {
      score = Math.min(score + 0.3, 1.0); // Reduced and capped boost
    }

    // Extra boost for exact BP094 matches (the most requested CS program)
    if (titleLower.includes('computer science') && contentLower.includes('bp094')) {
      score = Math.min(score + 0.2, 1.0); // Reduced and capped boost
    }

    // Debug logging for unexpected high scores
    if (score > 0.9 && !titleLower.includes('computer science') && !titleLower.includes('information technology')) {
      console.log(`⚠️ High score for non-CS result: "${title}" = ${score.toFixed(3)}`);
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Remove duplicate results based on URL similarity
   */
  private removeDuplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Map<string, SearchResult>();
    
    results.forEach(result => {
      const key = result.url.toLowerCase();
      if (!seen.has(key) || result.relevanceScore > seen.get(key)!.relevanceScore) {
        seen.set(key, result);
      }
    });
    
    return Array.from(seen.values());
  }

  /**
   * Utility functions
   */
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
    
    // Clean old cache entries
    this.searchCache.forEach((value, key) => {
      if (now > value.expiresAt) {
        this.searchCache.delete(key);
      }
    });
  }

  private createTimeoutPromise(): Promise<SearchResult[]> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Search timeout')), this.SEARCH_TIMEOUT);
    });
  }

  /**
   * Determine if search is needed based on query patterns
   */
  static shouldPerformSearch(query: string, conversationContext?: string[]): boolean {
    const queryLower = query.toLowerCase();
    
    // Memory questions - don't search
    if (conversationContext && conversationContext.length > 0) {
      const memoryQuestions = [
        'what was my first question', 'what did i ask first', 'my first question',
        'what was my previous question', 'what did i ask before', 'earlier question'
      ];
      
      if (memoryQuestions.some(pattern => queryLower.includes(pattern))) {
        console.log('🧠 Memory question - using conversation history');
        return false;
      }
    }
    
    // Explicit search triggers
    const searchTriggers = [
      'find me', 'search for', 'look up', 'can you find',
      'link for', 'website for', 'url for', 'page for',
      'where can i find', 'how do i find', 'show me'
    ];

    if (searchTriggers.some(trigger => queryLower.includes(trigger))) {
      console.log('🔍 Explicit search request detected');
      return true;
    }

    // Course/program patterns
    if (/bach.*of/i.test(query) || /bachelor.*of/i.test(query) || 
        /master.*of/i.test(query) || /diploma.*of/i.test(query) ||
        /\b[a-z]{2,4}\d{3,5}\b/i.test(query)) {
      console.log('🔍 Course-specific search detected');
      return true;
    }

    console.log('🧠 Using knowledge base as default');
    return false;
  }
}

// Export singleton instance
export const searchEngine = new RealTimeSearchEngine();
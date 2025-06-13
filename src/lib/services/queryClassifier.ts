// queryClassifier.ts
export interface ConversationContext {
  lastCourseCode?: string;
  lastProgramCode?: string;
  lastSchoolName?: string;
  recentEntities: {
    courses: string[];
    programs: string[];
    schools: string[];
  };
}

export interface QueryClassification {
  primaryTable: 'course' | 'program' | 'academic_information' | 'school' | null;
  secondaryTables: string[];
  queryType: 'specific_course' | 'specific_program' | 'general_course_search' | 'general_info' | 'school_info' | 'mixed';
  extractedEntities: {
    courseCode?: string;
    programCode?: string;
    schoolName?: string;
    keywords: string[];
  };
  contextUsed?: boolean;
}

export class QueryClassifier {
  static classify(query: string, context?: ConversationContext): QueryClassification {
    const queryLower = query.toLowerCase();
    
    console.log(`🎯 Query classification for: "${query}"`);
    console.log(`📋 Context available:`, context ? 'Yes' : 'No');
    if (context) {
      console.log(`📋 Last course:`, context.lastCourseCode);
      console.log(`📋 Recent courses:`, context.recentEntities.courses);
    }
    
    // Check for contextual references first
    if (context && this.hasContextualReference(queryLower)) {
      console.log(`🔗 Contextual reference detected in query`);
      const contextualResult = this.handleContextualQuery(query, queryLower, context);
      if (contextualResult) {
        console.log(`✅ Using contextual result:`, contextualResult);
        return contextualResult;
      }
    }
    
    // 1. Check for course code (HIGHEST PRIORITY)
    const courseCodeMatch = query.match(/\b([A-Z]{2,4}\d{3,5})\b/i);
    if (courseCodeMatch) {
      return {
        primaryTable: 'course',
        secondaryTables: [],
        queryType: 'specific_course',
        extractedEntities: {
          courseCode: courseCodeMatch[1].toUpperCase(),
          keywords: this.extractKeywords(query)
        }
      };
    }
    
    // 2. Check for course name patterns (before program patterns)
    const courseNamePatterns = [
      // Academic subjects with descriptors
      /\b(introduction|intro|fundamentals?|principles?|advanced|basic|elementary|intermediate)\s+(to|of|in)\s+[\w\s]+/i,
      
      // Subject areas (computing, theory, etc.)
      /\b[\w\s]*(computing|programming|software|theory|theoretical|practical|applied|data|information|cyber|digital|web|mobile|network|system|database|algorithm|artificial|intelligence|machine|learning)\b[\w\s]*/i,
      
      // Academic disciplines
      /\b[\w\s]*(planning|management|analysis|design|development|engineering|business|science|mathematics|accounting|finance|economics|statistics|physics|chemistry|biology|psychology|sociology|history|literature|philosophy|art|music)\b[\w\s]*/i,
      
      // Course/subject indicators
      /\b(course|subject|unit|class|module)\s+[\w\s]+/i,
      /\b[\w\s]+(course|subject|unit|class|module)\b/i,
      
      // General academic terms that suggest course content
      /\b[\w\s]*(theory|practice|application|study|studies|research|methodology|methods|techniques|skills|concepts|principles)\b[\w\s]*/i
    ];

    for (const pattern of courseNamePatterns) {
      if (pattern.test(query)) {
        console.log(`🎯 Course name pattern detected:`, pattern);
        return {
          primaryTable: 'course',
          secondaryTables: [],
          queryType: 'general_course_search',
          extractedEntities: {
            keywords: this.extractKeywords(query)
          }
        };
      }
    }

    // 3. Check for program patterns
    const programPatterns = {
      bachelor: /bachelor\s+(of\s+)?[\w\s]+/i,
      master: /master\s+(of\s+)?[\w\s]+/i,
      diploma: /diploma\s+(of\s+)?[\w\s]+/i,
      certificate: /certificate\s+[\w\s]+/i,
      programCode: /\b(BP\d{3,4}|MC\d{3,4}|BH\d{3,4})\b/i
    };
    
    for (const [type, pattern] of Object.entries(programPatterns)) {
      const match = query.match(pattern);
      if (match) {
        return {
          primaryTable: 'program',
          secondaryTables: [],
          queryType: 'specific_program',
          extractedEntities: {
            programCode: type === 'programCode' ? match[1] : undefined,
            keywords: this.extractKeywords(query)
          }
        };
      }
    }
    
    // 3. Check for school/faculty queries
    if (/school\s+of|faculty\s+of|computing\s+school|business\s+school/i.test(queryLower)) {
      return {
        primaryTable: 'school',
        secondaryTables: ['program', 'course'],
        queryType: 'school_info',
        extractedEntities: {
          keywords: this.extractKeywords(query)
        }
      };
    }
    
    // 4. Check for general academic queries
    const academicPatterns = [
      'enrollment', 'enrol', 'apply', 'application',
      'policy', 'policies', 'requirement', 'deadline',
      'fee', 'scholarship', 'support', 'help',
      'academic integrity', 'assessment', 'exam'
    ];
    
    if (academicPatterns.some(pattern => queryLower.includes(pattern))) {
      return {
        primaryTable: 'academic_information',
        secondaryTables: [],
        queryType: 'general_info',
        extractedEntities: {
          keywords: this.extractKeywords(query)
        }
      };
    }
    
    // 5. Mixed queries (search multiple tables)
    return {
      primaryTable: null,
      secondaryTables: ['course', 'program', 'academic_information'],
      queryType: 'mixed',
      extractedEntities: {
        keywords: this.extractKeywords(query)
      }
    };
  }
  
  /**
   * Check if query contains contextual references
   */
  private static hasContextualReference(queryLower: string): boolean {
    const contextualWords = [
      'it', 'this', 'that', 'the course', 'the program', 'the subject',
      'coordinator', 'prerequisites', 'assessment', 'this course', 'this program'
    ];
    return contextualWords.some(word => queryLower.includes(word));
  }

  /**
   * Check if query is a generic follow-up that should use recent context
   */
  private static isGenericFollowUp(queryLower: string): boolean {
    // Short queries that are likely follow-ups
    if (queryLower.length <= 15) {
      const followUpPatterns = [
        /^(and\s+)?again(\?)?$/,
        /^(show\s+me\s+)?(more|another|also|too)(\?)?$/,
        /^(what\s+about\s+)?more(\?)?$/,
        /^(and\s+)?(what\s+)?else(\?)?$/,
        /^(can\s+you\s+)?(repeat|show\s+again)(\?)?$/,
        /^(the\s+)?(same|similar)(\s+thing)?(\?)?$/,
        /^(once\s+)?more(\s+time)?(\?)?$/
      ];
      
      return followUpPatterns.some(pattern => pattern.test(queryLower.trim()));
    }
    
    return false;
  }

  /**
   * Handle queries that reference previous context
   */
  private static handleContextualQuery(
    query: string, 
    queryLower: string, 
    context: ConversationContext
  ): QueryClassification | null {
    
    // Check if this is a course-related question with context
    const courseQuestionWords = [
      'coordinator', 'coordinater', 'credit points', 'prerequisites', 'prereq',
      'assessment', 'learning outcomes', 'description', 'campus',
      'delivery mode', 'school', 'faculty', 'link', 'url', 'website',
      'page', 'information', 'details', 'more about', 'subject', 'course'
    ];
    
    const programQuestionWords = [
      'duration', 'entry requirements', 'career outcomes', 'fees',
      'coordinator', 'campus', 'delivery mode'
    ];
    
    // If asking about course-specific info and we have recent course context
    if (courseQuestionWords.some(word => queryLower.includes(word))) {
      console.log(`📚 Course question detected with words:`, courseQuestionWords.filter(word => queryLower.includes(word)));
      
      if (context.lastCourseCode) {
        console.log(`🎯 Using last course code: ${context.lastCourseCode}`);
        return {
          primaryTable: 'course',
          secondaryTables: [],
          queryType: 'specific_course',
          extractedEntities: {
            courseCode: context.lastCourseCode,
            keywords: this.extractKeywords(query)
          },
          contextUsed: true
        };
      }
      
      // If no specific course, but asking about "it" and we have recent courses
      if ((queryLower.includes('it') || queryLower.includes('this') || queryLower.includes('that')) 
          && context.recentEntities.courses.length > 0) {
        console.log(`🎯 Using recent course: ${context.recentEntities.courses[0]}`);
        return {
          primaryTable: 'course',
          secondaryTables: [],
          queryType: 'specific_course',
          extractedEntities: {
            courseCode: context.recentEntities.courses[0], // Use most recent
            keywords: this.extractKeywords(query)
          },
          contextUsed: true
        };
      }
    }
    
    // Handle generic follow-up requests when we have recent course context
    if (context.lastCourseCode && this.isGenericFollowUp(queryLower)) {
      console.log(`🔄 Generic follow-up detected, using last course: ${context.lastCourseCode}`);
      return {
        primaryTable: 'course',
        secondaryTables: [],
        queryType: 'specific_course',
        extractedEntities: {
          courseCode: context.lastCourseCode,
          keywords: this.extractKeywords(query)
        },
        contextUsed: true
      };
    }
    
    // If asking about program-specific info and we have recent program context
    if (programQuestionWords.some(word => queryLower.includes(word))) {
      if (context.lastProgramCode) {
        return {
          primaryTable: 'program',
          secondaryTables: [],
          queryType: 'specific_program',
          extractedEntities: {
            programCode: context.lastProgramCode,
            keywords: this.extractKeywords(query)
          },
          contextUsed: true
        };
      }
      
      // If no specific program, but asking about "it" and we have recent programs
      if ((queryLower.includes('it') || queryLower.includes('this') || queryLower.includes('that'))
          && context.recentEntities.programs.length > 0) {
        return {
          primaryTable: 'program',
          secondaryTables: [],
          queryType: 'specific_program',
          extractedEntities: {
            programCode: context.recentEntities.programs[0], // Use most recent
            keywords: this.extractKeywords(query)
          },
          contextUsed: true
        };
      }
    }
    
    return null;
  }

  /**
   * Extract context from a query result or previous conversation
   */
  static extractContext(query: string, previousContext?: ConversationContext): ConversationContext {
    const context: ConversationContext = previousContext || {
      recentEntities: { courses: [], programs: [], schools: [] }
    };
    
    // Extract course codes
    const courseCodeMatch = query.match(/\b([A-Z]{2,4}\d{3,5})\b/gi);
    if (courseCodeMatch) {
      const courseCode = courseCodeMatch[0].toUpperCase();
      context.lastCourseCode = courseCode;
      
      // Add to recent entities if not already there
      if (!context.recentEntities.courses.includes(courseCode)) {
        context.recentEntities.courses.unshift(courseCode);
        // Keep only last 3 courses
        context.recentEntities.courses = context.recentEntities.courses.slice(0, 3);
      }
    }
    
    // Extract program codes
    const programCodeMatch = query.match(/\b(BP\d{3,4}|MC\d{3,4}|BH\d{3,4})\b/gi);
    if (programCodeMatch) {
      const programCode = programCodeMatch[0].toUpperCase();
      context.lastProgramCode = programCode;
      
      // Add to recent entities if not already there
      if (!context.recentEntities.programs.includes(programCode)) {
        context.recentEntities.programs.unshift(programCode);
        // Keep only last 3 programs
        context.recentEntities.programs = context.recentEntities.programs.slice(0, 3);
      }
    }
    
    return context;
  }

  private static extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'what', 'how', 'when',
      'where', 'why', 'can', 'you', 'i', 'me', 'tell', 'about', 'who', 'that',
      'this', 'it', 'they', 'them', 'their', 'there', 'these', 'those',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'have', 'has', 'had', 'get', 'got', 'give', 'want', 'need', 'like'
    ]);
    
    return query.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(word => /^[a-zA-Z]+$/.test(word)); // Only alphabetic words
  }
}
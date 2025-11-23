import { EmbeddingService } from "@/services/embeddingService";

// Client-side resume analyzer (fallback when edge function is unavailable)

export interface ResumeAnalysis {
  extracted_skills: string[];
  experience_years: number;
  education_level: string;
  job_titles: string[];
  match_score: number;
  skill_gaps: Array<{ skill: string; importance: string }>;
  learning_recommendations: Array<{ course: string; platform: string; url: string }>;
  project_suggestions: Array<{ title: string; description: string; skills: string[] }>;
  ats_score: number;
  ats_breakdown?: {
    skill_match_score: number;
    keyword_match_score: number;
    experience_match_score: number;
    education_match_score: number;
    formatting_score: number;
    final_ats_score: number;
  };
  predicted_roles: string[];
  matching_skills: string[];
  missing_skills: string[];
  extra_skills: string[];
}

export async function analyzeResumeText(resumeText: string, jobDescription: string = ""): Promise<ResumeAnalysis> {
  const text = resumeText.toLowerCase();
  const jd = jobDescription.toLowerCase();

  // Extract skills from common technical keywords
  const commonSkills = [
    'javascript', 'typescript', 'react', 'angular', 'vue', 'node.js', 'python', 'java',
    'c++', 'c#', 'sql', 'mongodb', 'postgresql', 'aws', 'azure', 'docker', 'kubernetes',
    'git', 'agile', 'scrum', 'rest api', 'graphql', 'html', 'css', 'tailwind',
    'express', 'django', 'flask', 'spring boot', 'machine learning', 'ai', 'data science',
    'leadership', 'communication', 'teamwork', 'problem solving', 'project management',
    'deep learning', 'nlp', 'computer vision', 'statistics', 'linear algebra',
    'pandas', 'numpy', 'scikit-learn', 'tensorflow', 'pytorch', 'keras',
    'redux', 'next.js', 'nest.js', 'ci/cd', 'jenkins', 'terraform', 'ansible',
    'linux', 'bash', 'shell scripting', 'jira', 'confluence', 'figma', 'adobe xd'
  ];

  const extracted_skills = commonSkills.filter(skill => text.includes(skill));

  // Extract years of experience (rough estimation)
  const yearMatches = text.match(/(\d+)\+?\s*(years?|yrs?)/gi) || [];
  const experience_years = yearMatches.length > 0
    ? Math.max(...yearMatches.map(m => parseInt(m.match(/\d+/)?.[0] || '0')))
    : 2;

  // Detect education level
  let education_level = 'high_school';
  if (text.includes('phd') || text.includes('ph.d') || text.includes('doctorate')) {
    education_level = 'phd';
  } else if (text.includes('master') || text.includes('msc') || text.includes('mba') || text.includes('m.tech') || text.includes('m.e')) {
    education_level = 'masters';
  } else if (text.includes('bachelor') || text.includes('bsc') || text.includes('b.tech') || text.includes('b.e') || text.includes('bca') || text.includes('bba')) {
    education_level = 'bachelors';
  }

  // Extract job titles (common ones)
  const commonTitles = [
    'software engineer', 'developer', 'frontend developer', 'backend developer',
    'full stack', 'data scientist', 'data analyst', 'project manager', 'product manager',
    'designer', 'ux designer', 'ui designer', 'devops engineer', 'qa engineer',
    'system administrator', 'network engineer', 'database administrator', 'cloud architect'
  ];
  const job_titles = commonTitles.filter(title => text.includes(title));

  // Initialize scoring variables
  let match_score = 60;
  let matching_skills: string[] = [];
  let missing_skills: string[] = [];
  let extra_skills: string[] = [];

  // ATS Scoring Factors
  let skill_match_score = 0;
  let keyword_match_score = 0;
  let experience_match_score = 0;
  let education_match_score = 0;
  let formatting_score = 0;
  let final_ats_score = 0;

  if (jd) {
    const jdSkills = commonSkills.filter(skill => jd.includes(skill));

    // --- 1. Skill Match Score (40%) ---
    // Formula: (matching_skills / total_jd_skills) * 40

    // Semantic Matching Logic
    try {
      const embeddingService = EmbeddingService.getInstance();

      // Get embeddings for all skills
      const resumeSkillEmbeddings = await Promise.all(
        extracted_skills.map(skill => embeddingService.getEmbedding(skill))
      );

      const jdSkillEmbeddings = await Promise.all(
        jdSkills.map(skill => embeddingService.getEmbedding(skill))
      );

      // Threshold for semantic similarity
      const SIMILARITY_THRESHOLD = 0.65;

      const matchedIndices = new Set<number>();

      // Compare every JD skill with every Resume skill
      for (let i = 0; i < jdSkills.length; i++) {
        let bestMatchScore = 0;
        let bestMatchIndex = -1;

        for (let j = 0; j < extracted_skills.length; j++) {
          if (jdSkills[i] === extracted_skills[j]) {
            bestMatchScore = 1.0;
            bestMatchIndex = j;
            break;
          }

          const similarity = embeddingService.calculateSimilarity(jdSkillEmbeddings[i], resumeSkillEmbeddings[j]);
          if (similarity > bestMatchScore) {
            bestMatchScore = similarity;
            bestMatchIndex = j;
          }
        }

        if (bestMatchScore >= SIMILARITY_THRESHOLD) {
          matching_skills.push(jdSkills[i]);
          if (bestMatchIndex !== -1) matchedIndices.add(bestMatchIndex);
        } else {
          missing_skills.push(jdSkills[i]);
        }
      }

      extra_skills = extracted_skills.filter((_, index) => !matchedIndices.has(index));

    } catch (error) {
      console.error("Semantic matching failed, falling back to exact match:", error);
      matching_skills = extracted_skills.filter(skill => jdSkills.includes(skill));
      missing_skills = jdSkills.filter(skill => !extracted_skills.includes(skill));
      extra_skills = extracted_skills.filter(skill => !jdSkills.includes(skill));
    }

    const totalJDSkills = Math.max(jdSkills.length, 1);
    skill_match_score = (matching_skills.length / totalJDSkills) * 40;


    // --- 2. Keyword Relevance Score (25%) ---
    // Formula: (keywords_matched / total_keywords) * 25
    // Keywords = Skills + Job Titles + Domain Terms
    const domainTerms = ['designed', 'implemented', 'optimized', 'scaled', 'managed', 'led', 'developed', 'created', 'maintained'];
    const jdKeywords = [...jdSkills, ...commonTitles.filter(t => jd.includes(t)), ...domainTerms.filter(t => jd.includes(t))];

    let keywordsMatchedCount = 0;
    jdKeywords.forEach(keyword => {
      if (text.includes(keyword)) keywordsMatchedCount++;
    });

    const totalKeywords = Math.max(jdKeywords.length, 1);
    keyword_match_score = (keywordsMatchedCount / totalKeywords) * 25;


    // --- 3. Experience Match Score (15%) ---
    // Formula: similarity(resume_experience_embedding, jd_experience_embedding) * 15
    try {
      const embeddingService = EmbeddingService.getInstance();
      // Use full text as proxy for experience section if not explicitly parsed
      // In a real parser, we would extract the "Experience" section specifically
      const resumeEmbedding = await embeddingService.getEmbedding(text.slice(0, 1000)); // Limit text for performance
      const jdEmbedding = await embeddingService.getEmbedding(jd.slice(0, 1000));

      const experienceSimilarity = embeddingService.calculateSimilarity(resumeEmbedding, jdEmbedding);
      // Normalize similarity (usually -1 to 1, but for text usually 0 to 1) to 0-1 range if needed, 
      // but cosine similarity for text is typically positive.
      experience_match_score = Math.max(0, experienceSimilarity) * 15;
    } catch (error) {
      console.error("Experience matching failed:", error);
      experience_match_score = 10; // Fallback
    }


    // --- 4. Education & Certification Match Score (10%) ---
    // Formula: (matched_criteria / required_criteria) * 10
    let eduCriteriaTotal = 0;
    let eduCriteriaMatched = 0;

    // Check Degree
    if (jd.includes('phd') || jd.includes('doctorate')) {
      eduCriteriaTotal++;
      if (education_level === 'phd') eduCriteriaMatched++;
    } else if (jd.includes('master') || jd.includes('msc') || jd.includes('mba')) {
      eduCriteriaTotal++;
      if (education_level === 'phd' || education_level === 'masters') eduCriteriaMatched++;
    } else if (jd.includes('bachelor') || jd.includes('bsc') || jd.includes('degree')) {
      eduCriteriaTotal++;
      if (education_level !== 'high_school') eduCriteriaMatched++;
    }

    // Check Certifications (simple keyword check)
    const commonCerts = ['aws certified', 'azure certified', 'google cloud certified', 'pmp', 'scrum master', 'cissp', 'oracle certified'];
    const jdCerts = commonCerts.filter(c => jd.includes(c));
    if (jdCerts.length > 0) {
      eduCriteriaTotal += jdCerts.length;
      jdCerts.forEach(cert => {
        if (text.includes(cert)) eduCriteriaMatched++;
      });
    }

    if (eduCriteriaTotal === 0) {
      education_match_score = 10; // Full points if no specific requirements
    } else {
      education_match_score = (eduCriteriaMatched / eduCriteriaTotal) * 10;
    }


    // --- 5. Formatting & ATS Compatibility Score (10%) ---
    // Formula: (criteria_matched / 10) * 10
    let formattingCriteriaMatched = 0;
    const formattingTotal = 5; // We check 5 things

    // 1. Text Selectable/Parsable (Implicitly true if we have text)
    if (resumeText.length > 50) formattingCriteriaMatched++;

    // 2. Proper Headings
    if (text.includes('experience') || text.includes('work history')) formattingCriteriaMatched++;
    if (text.includes('education') || text.includes('academic')) formattingCriteriaMatched++;
    if (text.includes('skills') || text.includes('technologies')) formattingCriteriaMatched++;

    // 3. Bullet points usage
    if (text.includes('•') || text.includes('- ') || text.includes('* ')) formattingCriteriaMatched++;

    formatting_score = (formattingCriteriaMatched / formattingTotal) * 10;

    // --- FINAL SCORE ---
    final_ats_score = Math.round(
      skill_match_score +
      keyword_match_score +
      experience_match_score +
      education_match_score +
      formatting_score
    );

    // Calculate Match Score (Job Fit) - Normalized to 100
    // Based on Skills (40), Experience (15), and Education (10) = Total Weight 65
    const jobFitTotalWeight = 65;
    const jobFitScore = skill_match_score + experience_match_score + education_match_score;
    match_score = Math.min(95, Math.round((jobFitScore / jobFitTotalWeight) * 100));

  } else {
    // If no JD, all extracted skills are "extra"
    extra_skills = [...extracted_skills];
    // Default scores if no JD
    final_ats_score = 70;
    match_score = 70;
  }

  // Identify skill gaps based on JD
  const skill_gaps: Array<{ skill: string; importance: string }> = [];
  if (jd) {
    missing_skills.slice(0, 5).forEach(skill => {
      skill_gaps.push({
        skill: skill.charAt(0).toUpperCase() + skill.slice(1),
        importance: 'high'
      });
    });
  } else {
    // Generic skill gaps for modern market
    const modernSkills = ['typescript', 'docker', 'kubernetes', 'aws', 'react'];
    modernSkills.filter(s => !extracted_skills.includes(s)).slice(0, 5).forEach(skill => {
      skill_gaps.push({
        skill: skill.charAt(0).toUpperCase() + skill.slice(1),
        importance: 'medium'
      });
    });
  }

  // Learning recommendations with diverse platforms
  const platforms = [
    { name: 'Udemy', url: 'https://www.udemy.com/courses/search/?q=' },
    { name: 'Coursera', url: 'https://www.coursera.org/search?query=' },
    { name: 'Pluralsight', url: 'https://www.pluralsight.com/search?q=' },
    { name: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/search?keywords=' },
    { name: 'edX', url: 'https://www.edx.org/search?q=' },
    { name: 'Codecademy', url: 'https://www.codecademy.com/search?query=' },
    { name: 'FreeCodeCamp', url: 'https://www.freecodecamp.org/news/search/?query=' },
    { name: 'Udacity', url: 'https://www.udacity.com/courses/all?search=' },
    { name: 'Khan Academy', url: 'https://www.khanacademy.org/search?page_search_query=' },
    { name: 'YouTube (Programming)', url: 'https://www.youtube.com/results?search_query=' }
  ];

  const learning_recommendations = skill_gaps.slice(0, 8).map((gap, index) => {
    const platform = platforms[index % platforms.length];
    return {
      course: `Complete ${gap.skill} Course`,
      platform: platform.name,
      url: `${platform.url}${gap.skill.toLowerCase()}`
    };
  });

  // Project suggestions
  const project_suggestions = [
    {
      title: 'Build a Full-Stack Web Application',
      description: 'Create an end-to-end application with authentication, database, and modern UI',
      skills: ['React', 'Node.js', 'PostgreSQL', 'REST API']
    },
    {
      title: 'Containerize and Deploy Application',
      description: 'Deploy your application using Docker and cloud services',
      skills: ['Docker', 'AWS/Azure', 'CI/CD', 'DevOps']
    },
    {
      title: 'Open Source Contribution',
      description: 'Contribute to popular open-source projects to build community presence',
      skills: ['Git', 'GitHub', 'Collaboration', 'Code Review']
    }
  ];

  // Predict suitable roles
  const predicted_roles: string[] = [];
  if (extracted_skills.some(s => ['react', 'vue', 'angular', 'html', 'css'].includes(s))) {
    predicted_roles.push('Frontend Developer');
  }
  if (extracted_skills.some(s => ['node.js', 'python', 'java', 'sql', 'mongodb'].includes(s))) {
    predicted_roles.push('Backend Developer');
  }
  if (extracted_skills.some(s => ['react', 'node.js'].includes(s)) && extracted_skills.some(s => ['sql', 'mongodb'].includes(s))) {
    predicted_roles.push('Full Stack Developer');
  }
  if (extracted_skills.some(s => ['aws', 'docker', 'kubernetes'].includes(s))) {
    predicted_roles.push('DevOps Engineer');
  }
  if (predicted_roles.length === 0) {
    predicted_roles.push('Software Engineer', 'Developer');
  }

  return {
    extracted_skills: extracted_skills.map(s => s.charAt(0).toUpperCase() + s.slice(1)),
    experience_years,
    education_level,
    job_titles: job_titles.map(t => t.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')),
    match_score,
    skill_gaps,
    learning_recommendations,
    project_suggestions,
    ats_score: final_ats_score,
    ats_breakdown: {
      skill_match_score: Math.round(skill_match_score),
      keyword_match_score: Math.round(keyword_match_score),
      experience_match_score: Math.round(experience_match_score),
      education_match_score: Math.round(education_match_score),
      formatting_score: Math.round(formatting_score),
      final_ats_score: Math.round(final_ats_score)
    },
    predicted_roles,
    matching_skills: matching_skills.map(s => s.charAt(0).toUpperCase() + s.slice(1)),
    missing_skills: missing_skills.map(s => s.charAt(0).toUpperCase() + s.slice(1)),
    extra_skills: extra_skills.map(s => s.charAt(0).toUpperCase() + s.slice(1))
  };
}

package com.fullstack.ATSJobTracker.service;

import org.springframework.stereotype.Component;

@Component
public class PromptBuilder {

    private static final String ROLE = "Act as a strict Applicant Tracking System (ATS) and a senior software engineer / technical recruiter reviewing early-career / new-grad resumes.";

    private static final String CORE_INSTRUCTIONS = """
            I have provided a specific Base Resume below.
            You MUST preserve the exact structure, icons, and formatting of this provided Base Resume.
            Do not switch to a different template.
            
            Critical JD-Lock Requirement
            For every job description:
            Rewrite the resume so it feels specifically written for that exact role
            Mirror the JD's language, priorities, and technical focus
            Emphasize only the experiences and skills most relevant to that JD
            Down-weight or soften less-relevant experiences (without removing bullets)
            The resume must not feel reusable across multiple roles.
            
            Hard Constraints (Non-Negotiable)
            DO NOT change resume structure
            DO NOT add or remove sections
            DO NOT change spacing, formatting, ordering, layout, links, or LaTeX structure
            DO NOT change bullet count
            DO NOT edit or modify the Projects section
            Only wording changes are allowed
            Keep content truthful and realistic for an early-career candidate
            Resume tone: enthusiastic, eager to learn, technically curious
            Fix location to Warrensburg, MO
            
            Content Quality Rules
            Every bullet must be concrete or quantified
            Replace generic phrasing with specific tools, technologies, and outcomes
            Avoid keyword stuffing — keywords must appear naturally in context
            Use human, personal phrasing, not robotic ATS spam
            Use human, personal phrasing, not robotic ATS spam
            Bullets should read like they were written by a thoughtful candidate, not a template
            
            Realism & Specificity Rules
            Quantified results must be REALISTIC for the candidate's experience level.
            Do NOT invent executive-level achievements (e.g., "saved $1M", "led team of 20") for junior/entry-level roles.
            Focus on efficiency improvements, code quality, reducing tech debt, and specific feature deliveries.
            If extracting metrics from a JD, scale them down to be plausible for an individual contributor.
            
            WEAK vs STRONG Examples (Follow this style):
            WEAK: "Improved performance of the application."
            STRONG: "Reduced API latency by 40% (200ms to 120ms) by implementing Redis caching."
            
            WEAK: "Worked on a team to build a feature."
            STRONG: "Collaborated with 3 developers to ship the payments module 2 weeks ahead of schedule."
            
            WEAK: "Used Java and Spring Boot."
            STRONG: "Architected a microservice in Java/Spring Boot handling 500+ requests/sec."
            
            Your output MUST lean heavily towards the STRONG style.
            Every bullet point should answer: "What was the specific technical outcome?"
            
            Summary Rules
            Rewrite summary per JD
            Short, focused, role-specific
            Sound genuinely interested in this role, not "any role"
            """;

    private static final String COVER_LETTER_INSTRUCTIONS = """
            Cover Letter Rules
            Generate a JD-specific cover letter that fits on ONE page.
            The cover letter must be personal, concise, and recruiter-friendly.
            Reference:
            - The role's technical focus
            - Why this team/company is interesting
            - How past experiences map to this JD
            - How past experiences map to this JD
            - No generic language or templates
            - Do NOT use bullet points. Write in full, flowing paragraphs.
            
            IMPORTANT: If master's subjects are provided, naturally incorporate 1-2 relevant subjects
            the candidate studied during their master's program to strengthen the cover letter.
            Show how these courses make the candidate uniquely qualified for the role.
            Frame it as: "During my Master's program, I studied [relevant subject], which allows me to [contribute to this role]."
            
            The cover letter MUST follow this exact format/structure:
            [Full Name]
            [Address]
            [Phone]
            [Email]
            [LinkedIn URL if available]
            
            [Today's Date in "Month Day, Year" format]-FOLLOW THIS STRICTLY
            Hiring Manager
            [Company Name]
            [Company Address if known, otherwise omit this line]
            
            Re: Application for [Position Title] (Job ID: [Job ID if provided])
            
            Dear Hiring Manager,
            [Opening paragraph: Express interest, mention degree and GPA if provided, highlight years of experience and key technologies relevant to this JD]
            [Middle paragraph: Detail specific past experiences that match JD requirements, with concrete metrics and outcomes]
            [Middle paragraph: Detail specific past experiences that match JD requirements, with concrete metrics and outcomes]
            [Technical highlights paragraph: Weave the following technical skills seamlessly into a cohesive paragraph. DO NOT USE BULLET POINTS. Connect the skills logically to the potential impact on the team:]
            - Full-Stack/Technical skills relevant to the role
            - Master's coursework/Future-ready skills relevant to the role
            [Closing paragraph: Express enthusiasm for the company specifically, confidence in contributing]
            [Closing paragraph: Express enthusiasm for the company specifically, confidence in contributing]
            Thank you for your time and consideration. I look forward to the possibility of discussing how I can contribute to [specific team/goal].
            Sincerely,
            [Full Name]
            [Portfolio URL if available]
            [GitHub URL if available]
            """;

    private static final String OUTPUT_FORMAT = """
            Output Format (Strict)
            You MUST separate your output into exactly THREE sections using these exact markers:
            
            ===EXTRACTED_FIELDS_START===
            Position: [exact job title extracted from JD]
            Company: [company name extracted from JD]
            JobID: [job ID/requisition number extracted from JD, or NONE if not found]
            Location: [Extract ONLY "City, State" (e.g., "New York, NY") or "Remote" or "Hybrid". If not found, use "N/A". Do not include full address or zip code.]
            ===EXTRACTED_FIELDS_END===
            ===RESUME_START===
            [FULL updated LaTeX resume code here, copy-paste ready]
            ===RESUME_END===
            ===COVER_LETTER_START===
            [Cover letter plain text here]
            ===COVER_LETTER_END===
            
            DO NOT include anything else outside these markers.
            DO NOT include markdown code fences or any other formatting.
            """;

    public String buildPrompt(String baseResumeLatex, String jobDescription,
                              String userInfo, String masterSubjects) {
        StringBuilder prompt = new StringBuilder();
        prompt.append(ROLE).append("\n\n");
        prompt.append(CORE_INSTRUCTIONS).append("\n\n");
        prompt.append(COVER_LETTER_INSTRUCTIONS).append("\n\n");
        prompt.append(OUTPUT_FORMAT).append("\n\n");

        prompt.append("Base Resume:\n").append(baseResumeLatex).append("\n\n");
        prompt.append("Job Description:\n").append(jobDescription).append("\n\n");

        if (userInfo != null && !userInfo.isEmpty()) {
            prompt.append("Candidate Personal Information (use for cover letter header):\n")
                    .append(userInfo).append("\n\n");
        }

        if (masterSubjects != null && !masterSubjects.isEmpty()) {
            prompt.append("Master's Subjects Taken (use relevant ones to strengthen cover letter):\n")
                    .append(masterSubjects).append("\n\n");
        }

        return prompt.toString();
    }

    public String buildPrompt(String baseResumeLatex, String jobDescription) {
        return buildPrompt(baseResumeLatex, jobDescription, null, null);
    }
}
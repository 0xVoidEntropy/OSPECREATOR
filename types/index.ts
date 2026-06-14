export interface Subject {
  id: string
  name: string
  description: string
  color: string
  icon: string
  created_at: string
}

export interface Question {
  id: string
  subject_id: string
  station_number: number | null
  question_text: string
  answer: string | null
  hint: string | null
  image_url: string | null
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  created_at: string
  subjects?: Subject
}

export interface UserProgress {
  id: string
  user_id: string
  question_id: string
  answered: boolean
  correct: boolean | null
  attempts: number
  last_attempted: string | null
  created_at: string
}

export interface Lecture {
  id: string
  subject_id: string
  title: string
  file_url: string | null
  file_type: string | null
  uploaded_by: string
  created_at: string
  subjects?: Subject
}

export interface QuestionWithProgress extends Question {
  progress?: UserProgress
}

export interface SubjectWithStats extends Subject {
  total_questions: number
  answered_questions: number
}

export interface LecturePage {
  id: string
  lecture_id: string
  subject_id: string
  page_number: number
  image_url: string
  text_content: string
  created_at: string
}

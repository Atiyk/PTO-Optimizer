/** Field names that would hold child-identifying data. The product stores counts per age group only. */
export const CHILD_DATA_DENY = /child.?(name|first|last|dob|birth|id\b|address|guardian|parent|allerg|medical)|birth.?date|date.?of.?birth|\bdob\b|guardian|allerg|enrol+ee|student.?name|kid.?name|pupil/i;

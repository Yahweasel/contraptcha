//  Copyright 2013 Google Inc. All Rights Reserved.
//
//  Copyright 2024 Yahweasel
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.

#include <stdio.h>
#include <string.h>
#include <math.h>
#include <malloc.h>

const long long max_size = 2000;         // max length of strings
const long long N = 40;                  // number of closest words that will be shown
const long long max_w = 50;              // max length of vocabulary entries

int main(int argc, char **argv) {
  FILE *f;
  char *st1;
  char file_name[max_size], st[100][max_size];
  float dist, len, vec[max_size];
  long long words, size, a, b, c, d, cn, bi[100];
  char ch;
  float *M;
  char *vocab, *word;
  if (argc < 3) {
    printf("Usage: ./distance <FILE> <word>\nwhere FILE contains word projections in the BINARY FORMAT\n");
    return 0;
  }
  strcpy(file_name, argv[1]);
  f = fopen(file_name, "rb");
  if (f == NULL) {
    printf("Input file not found\n");
    return -1;
  }
  fscanf(f, "%lld", &words);
  fscanf(f, "%lld", &size);
  vocab = (char *)malloc((long long)words * max_w * sizeof(char));
  M = (float *)malloc((long long)words * (long long)size * sizeof(float));
  if (M == NULL) {
    printf("Cannot allocate memory: %lld MB    %lld  %lld\n", (long long)words * size * sizeof(float) / 1048576, words, size);
    return -1;
  }
  for (b = 0; b < words; b++) {
    a = 0;
    while (1) {
      vocab[b * max_w + a] = fgetc(f);
      if (feof(f) || (vocab[b * max_w + a] == ' ')) break;
      if ((a < max_w) && (vocab[b * max_w + a] != '\n')) a++;
    }
    vocab[b * max_w + a] = 0;
    for (a = 0; a < size; a++) fread(&M[a + b * size], sizeof(float), 1, f);
    len = 0;
    for (a = 0; a < size; a++) len += M[a + b * size] * M[a + b * size];
    len = sqrt(len);
    for (a = 0; a < size; a++) M[a + b * size] /= len;
  }
  fclose(f);
    a = 0;
    cn = 0;
    b = 0;
    c = 0;
    st1 = argv[2];
    while (1) {
      st[cn][b] = st1[c];
      b++;
      c++;
      st[cn][b] = 0;
      if (st1[c] == 0) break;
      if (st1[c] == ' ') {
        cn++;
        b = 0;
        c++;
      }
    }
    cn++;
    for (a = 0; a < cn; a++) {
      for (b = 0; b < words; b++) if (!strcmp(&vocab[b * max_w], st[a])) break;
      if (b == words) b = -1;
      bi[a] = b;
      if (b == -1) {
        printf("Out of dictionary word!\n");
        break;
      }
    }
    if (b == -1) return -1;
    for (a = 0; a < size; a++) vec[a] = 0;
    for (b = 0; b < cn; b++) {
      if (bi[b] == -1) continue;
      for (a = 0; a < size; a++) vec[a] += M[a + bi[b] * size];
    }
    len = 0;
    for (a = 0; a < size; a++) len += vec[a] * vec[a];
    len = sqrt(len);
    for (a = 0; a < size; a++) vec[a] /= len;
    printf("{\n");
    for (c = 0; c < words; c++) {
      a = 0;
      for (b = 0; b < cn; b++) if (bi[b] == c) a = 1;
      if (a == 1) continue;
      dist = 0;
      for (a = 0; a < size; a++) dist += vec[a] * M[a + c * size];
      word = &vocab[c * max_w];
      a = 0;
      for (b = 0; word[b]; b++) if (word[b] < 'a' || word[b] > 'z') a = 1;
      if (a == 1) continue;
      printf("\"%s\": %f,\n", &vocab[c * max_w], dist);
    }
    printf("\"-\": 0\n}\n");
  return 0;
}
